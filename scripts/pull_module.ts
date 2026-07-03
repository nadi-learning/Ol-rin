/**
 * pull_module (C2) — the repeatable direct-source content pull.
 *
 * Productizes the Session-8 MANUAL pull into one command:
 *
 *     bun run pull <moduleKey> [--out <dir>] [--board <slug> --ingest]
 *
 * It reaches the Starkhorn prod box over SSH and copies a module's
 * { manifest.json, bundle.js } into b2c's fixture tree, retiring the
 * hand-copied fixture. Two manifest paths:
 *   • PUBLISHED → a shipped manifest already exists on disk under
 *     ~/nadi/shared/.../revision_content/<moduleKey>/manifest.json → `cat` it
 *     (exact ship bytes, state-at-publish). No DB touched.
 *   • DRAFT (no shipped file, e.g. ch5_mixtures) → assemble the manifest
 *     READ-ONLY from the live DB, mirroring Starkhorn's
 *     manifest_builder.assembleForModule with the draft deltas (ALL slides,
 *     meta from slides.meta_json). Runs inside the nadi-backend container so
 *     DATABASE_URL stays on the box and is NEVER printed.
 *
 * READ-ONLY on Starkhorn — SELECT-only queries, `cat`/`find` reads, and the
 * assembler is piped via stdin to `bun -` (zero filesystem writes on the box).
 * All writes (fixture files, ingest) land ONLY in b2c.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️  THIS NEEDS TO BE SHIFTED TO AN API IN FUTURE.
 * Direct-box access (SSH + reading Starkhorn's internal DB schema) is the
 * INTERIM transport (decision D-C2-1). The proper end-state is the Option-B
 * HTTP pull: Starkhorn exposes `GET /content/:moduleKey → { manifest, bundle }`
 * and b2c pulls over HTTP — no SSH, no DB-shape coupling, the shared-kernel zod
 * schema as the wire contract. Swap this script's source for that fetch when
 * both apps are deployed; `ingestModule` (the write side) stays untouched.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { ingestModule } from "../src/services/ingest";

// ── prod box access (interim; see header) ──────────────────────────────────
const SSH_KEY = process.env.PULL_SSH_KEY ?? "/Users/mab/Desktop/nadi/infra/nadi-ec2.pem";
const SSH_HOST = process.env.PULL_SSH_HOST ?? "ubuntu@13.205.243.45";
const CONTAINER = process.env.PULL_CONTAINER ?? "nadi-backend";
const SHARED_ROOT = process.env.PULL_SHARED_ROOT ?? "~/nadi/shared";
const BUNDLE_VOL = process.env.PULL_BUNDLE_VOL ?? "/app/.preview-bundles";
const SSH_OPTS = ["-i", SSH_KEY, "-o", "ConnectTimeout=20", "-o", "BatchMode=yes"];
const MAX_BUF = 256 * 1024 * 1024; // bundles are ~0.5MB; headroom for safety

/** Run a remote command over SSH. `input` (if given) is piped to its stdin. */
function ssh(remoteCmd: string, input?: string): { stdout: string; stderr: string } {
  const r = spawnSync("ssh", [...SSH_OPTS, SSH_HOST, remoteCmd], {
    input,
    encoding: "utf8",
    maxBuffer: MAX_BUF,
  });
  // ssh's OWN failure (no connection/auth) is exit 255; a spawn error means the
  // ssh binary is missing. Both = box unreachable → distinct prefix so callers
  // (probe) can SKIP rather than FAIL. A remote command's non-zero exit passes
  // through as that code and is a REAL error, not unreachability.
  if (r.error || r.status === 255) {
    throw new Error(`SSH_UNREACHABLE: ${r.error?.message ?? `ssh exit 255 (connect/auth)`}`);
  }
  if (r.status !== 0) {
    // M20 — never swallow the remote error body.
    throw new Error(
      `remote command failed (exit ${r.status})\ncmd: ${remoteCmd}\nstderr: ${r.stderr?.trim() || "(none)"}`,
    );
  }
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// ── the in-container manifest assembler (DRAFT path) ────────────────────────
// Piped raw to `bun -` (no shell re-quoting). Mirrors Starkhorn's
// manifest_builder.assembleForModule with the two draft deltas:
//   (1) include ALL slides (no status filter), (2) read meta from
//   slides.meta_json directly (drafts have no published slide_versions row).
// SELECT-only. Reads DATABASE_URL from the container env; NEVER prints it.
// Emits { workspaceId, status, manifest } as one JSON line to stdout.
const ASSEMBLER_SRC = `
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, max: 1 });
const moduleKey = process.env.PULL_MODULE_KEY;
try {
  const [mod] = await sql\`select id, workspace_id, status from slide_modules where module_id = \${moduleKey} limit 1\`;
  if (!mod) { console.error("MODULE_NOT_FOUND: " + moduleKey); process.exit(2); }
  const [plan] = await sql\`select tree from topic_plans where workspace_id = \${mod.workspace_id} limit 1\`;
  const tree = (plan && plan.tree) || { topics: [] };
  const rows = await sql\`select topic_id, sub_topic_id, slide_id, title, status, meta_json, sort_order from slides where module_id = \${mod.id}\`;

  const byTopic = new Map();
  for (const s of rows) {
    const arr = byTopic.get(s.topic_id) || [];
    arr.push(s);
    byTopic.set(s.topic_id, arr);
  }
  const isVoiceEmpty = (v) => !v || ((v.context || "").trim().length === 0 && (!v.keywords || v.keywords.length === 0));

  const sections = [];
  const question_pools = {};
  for (const topic of (tree.topics || [])) {
    const list = byTopic.get(topic.topicId);
    if (!list || list.length === 0) continue;
    const order = new Map();
    (topic.subTopics || []).forEach((st, i) => order.set(st.subTopicId, i));
    const sorted = [...list].sort((a, b) => {
      const ai = order.has(a.sub_topic_id) ? order.get(a.sub_topic_id) : Number.MAX_SAFE_INTEGER;
      const bi = order.has(b.sub_topic_id) ? order.get(b.sub_topic_id) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return String(a.slide_id).localeCompare(String(b.slide_id));
    });
    const topics = [];
    for (const slide of sorted) {
      const meta = slide.meta_json || { voice_context: { context: "", keywords: [] }, mcqs: [] };
      const entry = { id: slide.slide_id, title: slide.title };
      if (!isVoiceEmpty(meta.voice_context)) entry.voice_context = meta.voice_context;
      topics.push(entry);
      if (meta.mcqs && meta.mcqs.length > 0) question_pools[slide.slide_id] = meta.mcqs;
    }
    sections.push({ id: topic.topicId, title: topic.name, topics });
  }
  const manifest = { module_id: moduleKey, sections, question_pools };
  console.log(JSON.stringify({ workspaceId: mod.workspace_id, status: mod.status, manifest }));
} finally {
  await sql.end();
}
`;

type AssembleOut = { workspaceId: string; status: string; manifest: any };

function assembleFromDb(moduleKey: string): AssembleOut {
  // NODE_PATH points at /app/node_modules so the piped script resolves `postgres`.
  const { stdout } = ssh(
    `docker exec -i -e NODE_PATH=/app/node_modules -e PULL_MODULE_KEY='${moduleKey}' -w /app ${CONTAINER} bun -`,
    ASSEMBLER_SRC,
  );
  const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  let out: AssembleOut;
  try {
    out = JSON.parse(line);
  } catch (e) {
    throw new Error(`assembler returned non-JSON:\n${stdout.slice(0, 500)}`);
  }
  return out;
}

/** Find a shipped manifest for a module (published fast-path). "" if none. */
function findShippedManifest(moduleKey: string): string {
  const { stdout } = ssh(
    `find ${SHARED_ROOT} -path '*/revision_content/${moduleKey}/manifest.json' 2>/dev/null | head -1`,
  );
  return stdout.trim();
}

function catRemote(path: string): string {
  return ssh(`cat '${path}'`).stdout;
}

/**
 * Read the module's preview bundle from the in-container volume. With a known
 * workspaceId (draft path) use the EXACT path — avoids stale orphan bundle dirs
 * (prod can have >1 dir for a moduleKey from old workspaces). Else find by key.
 */
function pullBundle(moduleKey: string, workspaceId?: string): string {
  // $-free inner (the container sh runs it; no remote-login-shell expansion).
  const inner = workspaceId
    ? `cat ${BUNDLE_VOL}/${workspaceId}/${moduleKey}/dist/bundle.js`
    : `find ${BUNDLE_VOL} -path "*/${moduleKey}/dist/bundle.js" -exec cat {} \\; -quit`;
  const { stdout } = ssh(`docker exec ${CONTAINER} sh -c '${inner}'`);
  return stdout;
}

async function main() {
  const args = process.argv.slice(2);
  const moduleKey = args.find((a) => !a.startsWith("--"));
  if (!moduleKey) {
    console.error("usage: bun run pull <moduleKey> [--out <dir>] [--board <slug> --ingest]");
    process.exit(1);
  }
  const outFlag = args.indexOf("--out");
  const outDir =
    outFlag >= 0
      ? args[outFlag + 1]!
      : join(import.meta.dir, "..", "fixtures", "starkhorn", moduleKey);
  const boardFlag = args.indexOf("--board");
  const boardSlug = boardFlag >= 0 ? args[boardFlag + 1] : undefined;
  const doIngest = args.includes("--ingest");

  console.log(`[pull] ${moduleKey} — reaching prod (${SSH_HOST}) …`);

  // 1. manifest — shipped file (published) preferred, else DB-assemble (draft).
  const shipped = findShippedManifest(moduleKey);
  let manifest: any;
  let provenance: string;
  let workspaceId: string | undefined;
  if (shipped) {
    manifest = JSON.parse(catRemote(shipped));
    provenance = `shipped file (published): ${shipped}`;
  } else {
    const out = assembleFromDb(moduleKey);
    manifest = out.manifest;
    workspaceId = out.workspaceId; // exact bundle path (avoids stale orphan dirs)
    provenance = `DB-assembled (status=${out.status}, workspace=${out.workspaceId})`;
  }
  if (!manifest?.module_id || !Array.isArray(manifest.sections)) {
    throw new Error(`assembled manifest missing module_id/sections for ${moduleKey}`);
  }

  // 2. bundle — from the preview-bundles volume.
  const bundle = pullBundle(moduleKey, workspaceId);
  if (!bundle.includes("export") || bundle.length < 1000) {
    throw new Error(`bundle for ${moduleKey} looks wrong (${bundle.length} bytes)`);
  }

  // 3. write the fixture (manifest format matches manifest_builder: 2-space + \n).
  mkdirSync(outDir, { recursive: true });
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  writeFileSync(join(outDir, "manifest.json"), manifestJson, "utf8");
  writeFileSync(join(outDir, "bundle.js"), bundle, "utf8");

  const slideCount = manifest.sections.reduce(
    (n: number, s: any) => n + (s.topics?.length ?? 0),
    0,
  );
  console.log(`[pull]   manifest: ${provenance}`);
  console.log(
    `[pull]   ${manifest.sections.length} sections / ${slideCount} slides / ` +
      `${Object.keys(manifest.question_pools ?? {}).length} question pools`,
  );
  console.log(`[pull]   bundle: ${(bundle.length / 1024).toFixed(0)} KB`);
  console.log(`[pull]   → ${outDir}/{manifest.json,bundle.js}`);

  // 4. optional ingest into a board (otherwise the existing seed scripts do it).
  if (doIngest) {
    if (!boardSlug) throw new Error("--ingest requires --board <slug>");
    const [b] = await db.select().from(board).where(eq(board.slug, boardSlug)).limit(1);
    if (!b) throw new Error(`board '${boardSlug}' not found (seed it first)`);
    await withBoard(b.id, async (tx: PgTransaction<any, any, any>) => {
      const res = await ingestModule(tx, { artifactDir: outDir });
      console.log(
        `[pull]   ingested → ${b.slug} v${res.versionNo}${res.unchanged ? " (unchanged)" : ""} unit ${res.contentUnitId}`,
      );
    });
  }

  await queryClient.end();
  console.log("[pull] done.");
}

main().catch(async (err) => {
  console.error("[pull] FAILED:", err instanceof Error ? err.message : err);
  try {
    await queryClient.end();
  } catch {}
  process.exit(1);
});
