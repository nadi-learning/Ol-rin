/**
 * probe_measure_thinking — measure the authoring worker's REAL thinking spend.
 *
 * Diagnostic for the 2026-07-16 authoring stall: both prod attempts died with
 * "The operation timed out." and logged NO thoughts= (the failure path printed no
 * usage), so the spend was invisible. This replays a real stored brief against a
 * given method pack, uncapped, exactly as runWorkerCall does for the gemini_api
 * vendor — the only way to see what thinking actually costs.
 *
 * Usage: bun run scripts/probe_measure_thinking.ts <briefFile> <packFile> <label>
 */
import { readFile } from "node:fs/promises";
import { geminiJson } from "../src/services/ai/gemini";
import { geminiQuestionSchema } from "../src/services/authoring";

const briefPath = process.argv[2];
const packPath = process.argv[3];
const label = process.argv[4] ?? "measure";

if (!briefPath || !packPath) {
  console.error("usage: bun run scripts/probe_measure_thinking.ts <briefFile> <packFile> <label>");
  process.exit(1);
}

// Strip the psql "SET" echo line that the export leaves on the brief.
const brief = (await readFile(briefPath, "utf8")).replace(/^SET\n/, "");

// Strip frontmatter the same way loadMethodPack does.
const rawPack = await readFile(packPath, "utf8");
const pack = rawPack.startsWith("---") ? rawPack.replace(/^---\n[\s\S]*?\n---\n/, "") : rawPack;

console.log(
  `[measure:${label}] pack=${pack.length}c brief=${brief.length}c — UNCAPPED, timeout=600s`,
);

const startedAt = Date.now();
try {
  const raw = await geminiJson<{ questions: unknown[] }>({
    label: `measure:${label}`,
    systemInstruction: pack,
    prompt: brief,
    responseSchema: geminiQuestionSchema as never,
    maxOutputTokens: null, // reproduce prod exactly
    timeoutMs: 600_000, // generous — we want the REAL latency, not a cut
  });
  console.log(
    `[measure:${label}] OK in ${Date.now() - startedAt}ms — questions=${raw.questions?.length ?? "?"}`,
  );
} catch (err) {
  console.error(
    `[measure:${label}] FAILED after ${Date.now() - startedAt}ms: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
}
process.exit(0);
