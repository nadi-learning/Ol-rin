import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import { trpcServer } from "@hono/trpc-server";
import { eq, sql } from "drizzle-orm";
import { board as boardTable } from "@b2c/kernel/schema";
import { env } from "./config/env";
import { db } from "./db/client";
import { auth } from "./auth/auth";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { BundleError, resolveBundle } from "./services/content";
import { ImageError, resolveImageBytes } from "./services/image_serve";
import {
  getUploadTokenForPhone,
  recordPhoneUpload,
  UploadError,
  type IncomingPhoto,
} from "./services/upload";
import { withBoard } from "./db/with-board";
import { NoMembershipError, requireMembership } from "./services/membership";
import {
  resolveRelaySession,
  VoiceContextMissingError,
  VoiceSessionNotFoundError,
} from "./services/voice";
import { VoiceRelay, type RelayContext } from "./services/voice_relay";

// Bun-native WebSocket for the voice relay (Slice VOICE-2a). `websocket` is
// exported in the default export so Bun.serve wires the upgrade handler.
const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono<{ Variables: { voiceRelayCtx: RelayContext } }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "x-board"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Liveness + DB connectivity. RLS-protected tables read empty without a board
// claim, so this pings a non-scoped scalar to confirm the connection is live.
app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, db: "up" });
  } catch (e) {
    return c.json({ ok: false, db: "down", error: String(e) }, 503);
  }
});

// Better Auth — Google OAuth handler (login, callback, session, signout).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Module bundle bytes (S4). The FE dynamic-import()s this URL to render a
// slide; that transport can't send x-board, so board comes from ?board= and
// the session cookie rides along (host-scoped). Membership + RLS gated in
// resolveBundle (D-S4-1). Served as JS so import() evaluates it as an ES module.
app.get("/content/bundle/:versionId", async (c) => {
  const versionId = c.req.param("versionId");
  const boardSlug = c.req.query("board") ?? "";
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  try {
    const bundle = await resolveBundle({
      versionId,
      boardSlug,
      email: session?.user?.email ?? null,
    });
    return c.body(bundle, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      // Always-latest (D-WS3): the current version's bytes can change on
      // re-publish, so never cache — the FE must see a fresh bundle on reload.
      "Cache-Control": "no-store",
    });
  } catch (e) {
    if (e instanceof BundleError) {
      return c.json({ error: e.code }, e.status as any);
    }
    throw e;
  }
});

// Rendered question-image bytes (Slice IMG). Same rationale as the bundle route:
// a plain <img src> can't send x-board, so board comes from ?board= and the
// session cookie rides along. Membership + RLS gated in resolveImageBytes.
app.get("/content/image/:imageId", async (c) => {
  const imageId = c.req.param("imageId");
  const boardSlug = c.req.query("board") ?? "";
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  try {
    const { bytes, mime } = await resolveImageBytes({
      imageId,
      boardSlug,
      email: session?.user?.email ?? null,
    });
    // Native Response (not c.body) — a raw byte body sidesteps Hono's
    // ArrayBuffer-variance typing on c.body. A given image id is immutable bytes
    // (a re-render is a NEW version/id), so cache it privately for a while.
    return new Response(bytes, {
      status: 200,
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    if (e instanceof ImageError) {
      return c.json({ error: e.code }, e.status as any);
    }
    throw e;
  }
});

// ── Cross-Device Upload phone routes (Slice Q3) ───────────────────────────
//
// UNAUTHENTICATED — the phone carries no session cookie and no board. The
// upload token (a 128-bit unguessable string in the path) IS the credential:
// it's read GLOBALLY by string, carries its own board_id, and is bound to one
// (student, session, question) slot + 30-min expiry + single-use. This is the
// ONE route family that intentionally diverges from the ?board=+cookie gate on
// the bundle/image routes above — see src/services/upload.ts for why.

// Phone page load: validate the token + return the question stem (not a secret).
app.get("/upload/:token", async (c) => {
  try {
    return c.json(await getUploadTokenForPhone(c.req.param("token")));
  } catch (e) {
    if (e instanceof UploadError) return c.json({ error: e.code }, e.status);
    throw e;
  }
});

// Phone upload: multipart `answer_image` files → object storage; token→uploaded.
app.post("/upload/:token", async (c) => {
  try {
    const form = await c.req.formData();
    const files = form.getAll("answer_image").filter((f): f is File => f instanceof File);
    const photos: IncomingPhoto[] = [];
    for (const f of files) {
      photos.push({
        bytes: new Uint8Array(await f.arrayBuffer()),
        mime: f.type || "application/octet-stream",
      });
    }
    return c.json(await recordPhoneUpload(c.req.param("token"), photos));
  } catch (e) {
    if (e instanceof UploadError) return c.json({ error: e.code }, e.status);
    throw e;
  }
});

// ── Voice relay WebSocket (Slice VOICE-2a) ────────────────────────────────
//
// browser mic/audio ⇄ our server ⇄ Gemini Live. Server-relay (D-VOICE-1): the
// key stays server-side and the transcript is captured server-authoritatively.
// Auth mirrors the bundle/image byte routes — a raw WS handshake can't carry the
// x-board header, so board comes from ?board= and the Better Auth session cookie
// rides along; ?sessionId= names a voice_session created by voice.startSession.
// Membership + ownership + voice_context are all checked BEFORE the socket is
// upgraded (a rejected upgrade returns an HTTP error; no Gemini socket opens).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WsAuth =
  | { ok: true; ctx: RelayContext }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409; code: string };

async function resolveVoiceWsContext(
  headers: Headers,
  boardSlug: string,
  sessionId: string,
): Promise<WsAuth> {
  if (!sessionId || !UUID_RE.test(sessionId))
    return { ok: false, status: 400, code: "MISSING_SESSION_ID" };
  if (!boardSlug) return { ok: false, status: 400, code: "MISSING_BOARD" };
  const session = await auth.api.getSession({ headers });
  const email = session?.user?.email;
  if (!email) return { ok: false, status: 401, code: "UNAUTHORIZED" };

  const [boardRow] = await db
    .select({ id: boardTable.id, slug: boardTable.slug })
    .from(boardTable)
    .where(eq(boardTable.slug, boardSlug))
    .limit(1);
  if (!boardRow) return { ok: false, status: 400, code: "UNKNOWN_BOARD" };

  try {
    const resolved = await withBoard(boardRow.id, async (tx) => {
      const m = await requireMembership(tx, { email, board: boardRow });
      const info = await resolveRelaySession(tx, sessionId, m.userId);
      return { userId: m.userId, info };
    });
    if (resolved.info.status !== "active")
      return { ok: false, status: 409, code: "SESSION_NOT_ACTIVE" };
    return {
      ok: true,
      ctx: {
        boardId: boardRow.id,
        appUserId: resolved.userId,
        sessionId,
        mode: resolved.info.mode,
        systemPrompt: resolved.info.systemPrompt,
      },
    };
  } catch (e) {
    if (e instanceof NoMembershipError)
      return { ok: false, status: 403, code: "NO_MEMBERSHIP" };
    if (e instanceof VoiceSessionNotFoundError)
      return { ok: false, status: 404, code: "VOICE_SESSION_NOT_FOUND" };
    if (e instanceof VoiceContextMissingError)
      return { ok: false, status: 400, code: "NO_VOICE_CONTEXT" };
    throw e;
  }
}

app.get(
  "/voice/live",
  async (c, next) => {
    const wsAuth = await resolveVoiceWsContext(
      c.req.raw.headers,
      c.req.query("board") ?? "",
      c.req.query("sessionId") ?? "",
    );
    if (!wsAuth.ok) return c.json({ error: wsAuth.code }, wsAuth.status);
    c.set("voiceRelayCtx", wsAuth.ctx);
    await next();
  },
  upgradeWebSocket((c) => {
    const relay = new VoiceRelay(c.get("voiceRelayCtx"));
    return {
      onOpen: (_evt, ws) => {
        void relay.start(ws);
      },
      onMessage: (evt, ws) => {
        void relay.onClientMessage(evt.data as string | ArrayBuffer, ws);
      },
      onClose: () => {
        void relay.onClientClose();
      },
      onError: () => {
        void relay.onClientClose();
      },
    };
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext(c),
  }),
);

app.get("/", (c) =>
  c.json({ service: "b2c-backend", env: env.NODE_ENV, ts: new Date().toISOString() }),
);

export default {
  port: env.PORT,
  fetch: app.fetch,
  websocket,
};

console.log(`[b2c-backend] listening on http://localhost:${env.PORT}`);
