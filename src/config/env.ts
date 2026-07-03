import { z } from "zod";

// ai-build-miss M2: dotenv gives "" (not undefined) for blank vars, so a bare
// `.optional()` on a `.url()`/`.min()` field still fails. Treat "" as absent.
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(3010),
  FRONTEND_URL: z.string().url().default("http://localhost:5174"),

  // App connection — a NON-superuser role, so RLS binds (see src/db/rls.sql).
  DATABASE_URL: z.string().url(),
  // Owner connection — DDL + role/RLS setup. Falls back to DATABASE_URL.
  MIGRATE_DATABASE_URL: blankToUndefined(z.string().url().optional()),

  REDIS_URL: z.string().url().default("redis://localhost:6381"),

  // Better Auth — wired in S1 (required now).
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  // Google OAuth — copied from the current b2c prod (.env). b2c-owned identity
  // (PF3 revised); the only sign-in provider for S1.
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // Gemini — the Stage-1 scorer's vendor (Slice AI-1, G8). OPTIONAL on purpose:
  // the BE + worker must still boot without it (the kill switch / fault
  // isolation — a missing key fails the scoring JOB loudly, never app boot).
  // Default model = gemini-3-flash-preview, matching b2c prod's evaluation path
  // (evaluation_service.py reads student answers on the same flash model).
  GEMINI_API_KEY: blankToUndefined(z.string().min(1).optional()),
  GEMINI_MODEL: z.string().min(1).default("gemini-3-flash-preview"),
  // Slice VOICE-2 — the Gemini Live realtime model (a DISTINCT surface from the
  // generateContent path above; `gemini-3-flash-preview` is NOT Live-capable).
  // Default is the SDK-documented Live model; flip via env to a newer/native-audio
  // one without a code change. blankToUndefined (M2) so an empty override falls
  // back to the default rather than failing `.min(1)`.
  // Verified against this key's ListModels (must support `bidiGenerateContent`);
  // flip via env to another bidi model without a code change.
  GEMINI_LIVE_MODEL: blankToUndefined(
    z.string().min(1).default("gemini-3.1-flash-live-preview"),
  ),

  // Slice IMG — the matplotlib render sidecar (nadi-pyrender). In dev we reuse
  // the same instance Starkhorn runs (stateless, read-only rendering); on deploy
  // b2c runs its own. IMAGES_DIR is the local-FS store for rendered PNGs (R2
  // deferred to deploy, like OAuth). The pipeline is fault-isolated — a missing
  // sidecar fails the render JOB loudly, never app/worker boot.
  PYRENDER_URL: z.string().url().default("http://127.0.0.1:8002"),
  IMAGES_DIR: z.string().min(1).default("./data/images"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[env] invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
