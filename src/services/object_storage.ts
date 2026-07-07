/**
 * Object storage for uploaded answer photos (Slice Q3, D-Q3-5).
 *
 * Image BYTES live here (S3 in prod, local-FS in dev/probe); the image
 * METADATA (attempt_image rows, upload_token.upload_keys[]) lives in Postgres.
 * The driver is chosen by env.STORAGE_DRIVER so the upload/serve code is
 * backend-agnostic — a `storageKey` is the same shape under both (an S3 object
 * key), so switching fs→s3 is a config flip, no caller change.
 *
 *  - 'fs' (default) — writes under env.UPLOADS_DIR; used by local dev + the
 *    deterministic probe (no cloud creds needed).
 *  - 's3'           — Bun's native S3 client (S3 or R2 via S3_ENDPOINT). Creds
 *    validated lazily on first use → a misconfigured s3 driver fails the upload
 *    JOB loudly (kill-switch), never app boot. Two credential modes (D-Q3-6):
 *    a STATIC KEY from env, or (prod) an EC2 INSTANCE ROLE — no stored secret,
 *    creds fetched + auto-refreshed from instance metadata (see s3() below).
 *
 * NOTE (Q3-3): HEIC→JPEG conversion (iPhone photos, for browser <img> display)
 * is a separate step wired in the FE/device slice against a real photo — bytes
 * are stored with their declared mime here. Gemini vision reads HEIC directly.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { env } from "../config/env";

export interface StoredObject {
  bytes: Uint8Array;
  mime: string;
}

// ───────────────────────────── fs driver ─────────────────────────────
const fsRoot = () => resolve(env.UPLOADS_DIR);

/** Absolute path for a key, guarded against path traversal. */
function fsPathFor(key: string): string {
  const abs = resolve(fsRoot(), key);
  if (abs !== fsRoot() && !abs.startsWith(fsRoot() + "/")) {
    throw new Error(`unsafe storage key: ${key}`);
  }
  return abs;
}

async function fsPut(key: string, bytes: Uint8Array): Promise<void> {
  const p = fsPathFor(key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, bytes);
}

async function fsGet(key: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fsPathFor(key)));
}

// ───────────────────────────── s3 driver ─────────────────────────────
// Lazy singleton so a missing bucket/creds only bites when the s3 driver is
// actually used (not at import). Bun-native S3 (no @aws-sdk dependency).
//
// Two credential modes (D-Q3-6):
//  - STATIC KEY — S3_ACCESS_KEY_ID/SECRET from env; the client is built once and
//    reused forever (keys don't rotate).
//  - INSTANCE ROLE (S3_USE_INSTANCE_ROLE=true) — no stored secret. Bun's S3Client
//    does NOT implement the AWS IMDS credential chain, so we fetch the EC2 role's
//    TEMPORARY, auto-rotating creds from instance metadata (IMDSv2) ourselves and
//    build the client with them, REBUILDING when they near expiry. This is how
//    prod (the Olórin EC2) authenticates — the leaked-key risk of a stored secret
//    is eliminated.
let s3Client: import("bun").S3Client | null = null;
let s3CredsExpireAt = 0; // epoch ms after which the instance-role client is stale (0 = static, never)

function bunRt() {
  // Bun global (import { S3Client } from "bun" trips the type graph under
  // node-resolution — reach it off globalThis like the D-S1-5 bunRT shim).
  return (globalThis as unknown as { Bun: typeof import("bun") }).Bun;
}

interface ImdsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Fetch the EC2 instance-role's temporary creds via IMDSv2 (token → role name →
 * creds). Short timeouts so a non-EC2 host (or blocked IMDS) fails FAST and loud
 * rather than hanging the upload. The base is overridable (S3_IMDS_BASE_URL) so a
 * probe can point at a local fake metadata server.
 */
export async function fetchInstanceRoleCreds(
  base: string = env.S3_IMDS_BASE_URL ?? "http://169.254.169.254",
): Promise<ImdsCreds> {
  const tokenRes = await fetch(`${base}/latest/api/token`, {
    method: "PUT",
    headers: { "X-aws-ec2-metadata-token-ttl-seconds": "21600" },
    signal: AbortSignal.timeout(2000),
  });
  if (!tokenRes.ok) throw new Error(`IMDS token request failed: ${tokenRes.status}`);
  const token = (await tokenRes.text()).trim();
  const h = { "X-aws-ec2-metadata-token": token };

  const roleRes = await fetch(`${base}/latest/meta-data/iam/security-credentials/`, {
    headers: h,
    signal: AbortSignal.timeout(2000),
  });
  if (!roleRes.ok) throw new Error(`IMDS role lookup failed: ${roleRes.status}`);
  const role = (await roleRes.text()).trim().split("\n")[0];
  if (!role) throw new Error("IMDS returned no instance role (is one attached?)");

  const credRes = await fetch(
    `${base}/latest/meta-data/iam/security-credentials/${role}`,
    { headers: h, signal: AbortSignal.timeout(2000) },
  );
  if (!credRes.ok) throw new Error(`IMDS creds fetch failed: ${credRes.status}`);
  const j = (await credRes.json()) as {
    Code?: string;
    AccessKeyId?: string;
    SecretAccessKey?: string;
    Token?: string;
    Expiration?: string;
  };
  if (!j.AccessKeyId || !j.SecretAccessKey || !j.Token || !j.Expiration) {
    throw new Error(`IMDS creds incomplete (Code=${j.Code ?? "?"})`);
  }
  return {
    accessKeyId: j.AccessKeyId,
    secretAccessKey: j.SecretAccessKey,
    sessionToken: j.Token,
    expiresAt: new Date(j.Expiration).getTime(),
  };
}

/** The S3 client for the current credential mode; async because instance-role
 *  creds are fetched (and refreshed before expiry) over IMDS. */
async function s3(): Promise<import("bun").S3Client> {
  const { S3_BUCKET, S3_REGION, S3_ENDPOINT } = env;
  if (!S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 but S3_BUCKET is unset");

  // Instance-role mode: rebuild when we have no client or the creds are near
  // expiry (refresh 5 min early so an in-flight upload never uses expired creds).
  if (env.S3_USE_INSTANCE_ROLE) {
    if (s3Client && Date.now() < s3CredsExpireAt) return s3Client;
    const creds = await fetchInstanceRoleCreds();
    s3Client = new (bunRt().S3Client)({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      bucket: S3_BUCKET,
      region: S3_REGION,
      endpoint: S3_ENDPOINT,
    });
    s3CredsExpireAt = creds.expiresAt - 5 * 60_000;
    return s3Client;
  }

  // Static-key mode: build once, reuse forever (keys don't rotate).
  if (s3Client) return s3Client;
  const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error(
      "STORAGE_DRIVER=s3 (static-key mode) but S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are unset (or set S3_USE_INSTANCE_ROLE=true)",
    );
  }
  s3Client = new (bunRt().S3Client)({
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    bucket: S3_BUCKET,
    region: S3_REGION,
    endpoint: S3_ENDPOINT, // set for R2 / non-AWS; undefined = AWS S3
  });
  return s3Client;
}

async function s3Put(key: string, bytes: Uint8Array, mime: string): Promise<void> {
  await (await s3()).file(key).write(bytes, { type: mime });
}

async function s3Get(key: string): Promise<Uint8Array> {
  return new Uint8Array(await (await s3()).file(key).arrayBuffer());
}

// ───────────────────────────── public API ─────────────────────────────

/** Store bytes under an object key (driver-selected). */
export async function putObject(
  key: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  if (env.STORAGE_DRIVER === "s3") return s3Put(key, bytes, mime);
  return fsPut(key, bytes);
}

/** Read bytes for an object key (driver-selected). */
export async function getObject(key: string): Promise<Uint8Array> {
  if (env.STORAGE_DRIVER === "s3") return s3Get(key);
  return fsGet(key);
}

// Test hooks (probe_s3_instance_role) — exercise the instance-role client's
// fetch/refresh gate off-box against a fake IMDS. Not used by app code.
export const __s3ClientForTest = s3;
export function __s3ResetForTest(): void {
  s3Client = null;
  s3CredsExpireAt = 0;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
};

/** Object key for the n-th photo of an upload token: `uploads/{token}/{n}.{ext}`. */
export function uploadKeyFor(token: string, ordinal: number, mime: string): string {
  const ext = EXT_BY_MIME[mime.toLowerCase()] ?? "bin";
  return `uploads/${token}/${ordinal}.${ext}`;
}
