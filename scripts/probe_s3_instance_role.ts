/**
 * probe_s3_instance_role — Slice Q3 (D-Q3-6) exit gate for the EC2 INSTANCE-ROLE
 * credential path in object_storage.ts.
 *
 * Prod (the Olórin EC2) authenticates to S3 with an instance role — NO stored
 * secret. Bun's native S3Client does NOT implement the AWS IMDS credential chain,
 * so object_storage fetches the role's temporary, auto-rotating creds from
 * instance metadata (IMDSv2) itself and refreshes them before expiry. This probe
 * exercises that logic OFF-BOX against a FAKE IMDS HTTP server (no EC2 needed) —
 * the real S3 round-trip through these creds can only run on the box (a follow-up
 * eyeball once the role is attached), but the risky part (the IMDSv2 protocol +
 * the refresh gate) is fully deterministic here.
 *
 * Run via `bun run probe:s3role` (the npm script sets STORAGE_DRIVER=s3,
 * S3_USE_INSTANCE_ROLE=true, S3_BUCKET, and S3_IMDS_BASE_URL=http://127.0.0.1:8055
 * so env parses in instance-role mode pointed at the fake server). No DB/Redis.
 *
 *   1. IMDSv2 happy path: token handshake → role lookup → creds JSON parsed
 *      (accessKeyId/secretAccessKey/sessionToken + Expiration → epoch ms).
 *   2. IMDSv2 token is carried on the metadata GETs (the v2 requirement).
 *   3. no instance role attached (empty list) → throws (loud, not silent).
 *   4. no metadata service reachable → FAST-fail (<5s, the 2s timeout), not a hang.
 *   5. refresh gate: far-future expiry → s3() caches (no refetch); near expiry →
 *      s3() refetches every call (rotating creds never go stale in use).
 */
const BunRt = (globalThis as unknown as { Bun: typeof import("bun") }).Bun;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// ── fake IMDS server (controllable) ──
const IMDS_PORT = 8055;
const state = {
  issuedToken: "",
  roleName: "olorin-b2c-ec2",
  expirationIso: new Date(Date.now() + 3600_000).toISOString(), // far future
  credHits: 0,
  lastMetaTokenHeader: null as string | null,
  tokenCounter: 0,
};

const server = BunRt.serve({
  port: IMDS_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    // IMDSv2: PUT /latest/api/token
    if (p === "/latest/api/token" && req.method === "PUT") {
      state.issuedToken = `FAKE-IMDS-TOKEN-${++state.tokenCounter}`;
      return new Response(state.issuedToken, { status: 200 });
    }
    const tok = req.headers.get("x-aws-ec2-metadata-token");
    // role list
    if (p === "/latest/meta-data/iam/security-credentials/") {
      if (tok !== state.issuedToken) return new Response("missing token", { status: 401 });
      return new Response(state.roleName, { status: 200 });
    }
    // creds for the role
    if (p === `/latest/meta-data/iam/security-credentials/${state.roleName}`) {
      if (tok !== state.issuedToken) return new Response("missing token", { status: 401 });
      state.credHits++;
      state.lastMetaTokenHeader = tok;
      return Response.json({
        Code: "Success",
        AccessKeyId: "ASIAFAKEROLEKEY",
        SecretAccessKey: "fake-secret-from-imds",
        Token: "fake-session-token-from-imds",
        Expiration: state.expirationIso,
      });
    }
    return new Response("not found", { status: 404 });
  },
});

async function main() {
  // Imported AFTER the server is up (module reads env.S3_IMDS_BASE_URL at call time).
  const { fetchInstanceRoleCreds, __s3ClientForTest, __s3ResetForTest } = await import(
    "../src/services/object_storage"
  );

  // 1. happy path
  const creds = await fetchInstanceRoleCreds();
  check(
    "IMDSv2 happy path → creds parsed (accessKeyId/secret/sessionToken)",
    creds.accessKeyId === "ASIAFAKEROLEKEY" &&
      creds.secretAccessKey === "fake-secret-from-imds" &&
      creds.sessionToken === "fake-session-token-from-imds",
  );
  check(
    "Expiration parsed to epoch ms",
    creds.expiresAt === new Date(state.expirationIso).getTime() && creds.expiresAt > Date.now(),
  );

  // 2. the metadata GET carried the v2 token from the PUT handshake
  check(
    "IMDSv2 token carried on the creds GET (v2 handshake honoured)",
    state.lastMetaTokenHeader === state.issuedToken && state.issuedToken.startsWith("FAKE-IMDS-TOKEN-"),
  );

  // 3. no role attached → throws loud
  const savedRole = state.roleName;
  state.roleName = "";
  let noRoleThrew = false;
  try {
    await fetchInstanceRoleCreds();
  } catch {
    noRoleThrew = true;
  }
  state.roleName = savedRole;
  check("no instance role attached → throws (loud, not silent empty creds)", noRoleThrew);

  // 4. no metadata service → FAST-fail (2s timeout), not a hang
  const t0 = Date.now();
  let fastFailed = false;
  try {
    await fetchInstanceRoleCreds("http://127.0.0.1:1"); // nothing listens
  } catch {
    fastFailed = true;
  }
  const elapsed = Date.now() - t0;
  check(`unreachable IMDS → fails fast in ${elapsed}ms (<5s, not a hang)`, fastFailed && elapsed < 5000);

  // 5. refresh gate — far expiry caches; near expiry refetches every call.
  __s3ResetForTest();
  state.expirationIso = new Date(Date.now() + 3600_000).toISOString(); // far
  const beforeFar = state.credHits;
  await __s3ClientForTest();
  await __s3ClientForTest();
  const farDelta = state.credHits - beforeFar;
  check(`far-future creds → s3() fetched ONCE across 2 calls (cached), delta=${farDelta}`, farDelta === 1);

  __s3ResetForTest();
  state.expirationIso = new Date(Date.now() + 4 * 60_000).toISOString(); // within the 5-min refresh window
  const beforeNear = state.credHits;
  await __s3ClientForTest();
  await __s3ClientForTest();
  const nearDelta = state.credHits - beforeNear;
  check(`near-expiry creds → s3() REFETCHES each call (never uses stale), delta=${nearDelta}`, nearDelta === 2);

  server.stop(true);
  console.log(`\nprobe_s3_instance_role: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("probe_s3_instance_role FAILED:", err);
  server.stop(true);
  process.exit(1);
});
