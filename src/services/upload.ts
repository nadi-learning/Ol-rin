/**
 * Cross-Device Upload — the token lifecycle (Slice Q3, D-Q3-1..2).
 *
 * A student answers a subjective practice question on paper, scans a QR on the
 * desktop, and uploads photos from their phone (UNAUTHENTICATED). The token is
 * the whole security envelope:
 *
 *   mint (authed desktop)  → status 'pending', bound to (user, session, question),
 *                            30-min expiry, carries board_id
 *   upload (unauth phone)  → bytes → object storage; status 'uploaded'
 *   submit (authed desktop)→ consume ('consumed', single-use) → attempt + photos
 *
 * upload_token is a GLOBAL (non-RLS) table read by its 128-bit `token` string —
 * the phone has no board claim, so RLS can't gate it; the token IS the
 * credential (M11: mint is the SET side, the pending→uploaded→consumed flips are
 * the enablement, and every consumer re-validates). Every write the token
 * authorizes still runs under withBoard(token.board_id) (M24/M29).
 */
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { practiceSession, question, uploadToken } from "@b2c/kernel/schema";
import { db } from "../db/client";
import { withBoard } from "../db/with-board";
import { putObject, uploadKeyFor } from "./object_storage";

type Tx = PgTransaction<any, any, any>;

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min (matches prod)
const MAX_PHOTOS = 10; // per upload batch (v0)

/** HTTP-shaped error for the unauth phone routes (status + stable code). */
export class UploadError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 410 | 413 | 415,
    readonly code: string,
  ) {
    super(code);
    this.name = "UploadError";
  }
}

/** Authed-side errors (mapped to tRPC codes by the router). */
export class UploadSlotInvalidError extends Error {
  readonly code = "UPLOAD_SLOT_INVALID";
  constructor(msg: string) {
    super(msg);
    this.name = "UploadSlotInvalidError";
  }
}
export class UploadNotReadyError extends Error {
  readonly code = "UPLOAD_NOT_READY";
  constructor(msg: string) {
    super(msg);
    this.name = "UploadNotReadyError";
  }
}

function newToken(): string {
  return randomBytes(16).toString("hex"); // 128-bit, URL-safe hex (like prod)
}

// ─────────────────────────── mint (authed desktop) ───────────────────────────

export interface MintedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Mint (or reuse) an upload token for a (session, question) slot the caller
 * owns. Idempotent for the SAME live attempt: an existing unexpired *pending*
 * token is returned rather than spawning a parallel one (so a mode-toggle /
 * remount re-shows the same QR). A token that has already been UPLOADED but not
 * yet consumed is deliberately NOT reused — reusing it would strand a retry (the
 * phone can't upload to an already-'uploaded' token, so the page would greet the
 * student with "already uploaded" before they upload anything). Instead we mint
 * a fresh pending token; the stale uploaded one is abandoned and expires. Runs
 * inside the authed board tx; upload_token is global so no RLS applies, but the
 * FKs validate under the claim.
 */
export async function mintUploadToken(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    sessionId: string;
    questionId: string;
  },
): Promise<MintedToken> {
  // The session must be the caller's, and the question must belong to it.
  const [s] = await tx
    .select({ id: practiceSession.id, appUserId: practiceSession.appUserId, questionIds: practiceSession.questionIds })
    .from(practiceSession)
    .where(eq(practiceSession.id, args.sessionId))
    .limit(1);
  if (!s || s.appUserId !== args.appUserId) {
    throw new UploadSlotInvalidError(`no session ${args.sessionId} for this user`);
  }
  if (!s.questionIds.includes(args.questionId)) {
    throw new UploadSlotInvalidError(
      `question ${args.questionId} is not in session ${args.sessionId}`,
    );
  }

  const now = Date.now();
  const [existing] = await tx
    .select()
    .from(uploadToken)
    .where(
      and(
        eq(uploadToken.appUserId, args.appUserId),
        eq(uploadToken.practiceSessionId, args.sessionId),
        eq(uploadToken.questionId, args.questionId),
        // ONLY a still-pending token is reused. An 'uploaded' (unconsumed) token
        // is left behind so a fresh, uploadable token is minted for the retry.
        eq(uploadToken.status, "pending"),
      ),
    )
    .limit(1);
  if (existing && existing.expiresAt.getTime() > now) {
    return { token: existing.token, expiresAt: existing.expiresAt };
  }

  const token = newToken();
  const expiresAt = new Date(now + TOKEN_TTL_MS);
  await tx.insert(uploadToken).values({
    token,
    boardId: args.boardId,
    appUserId: args.appUserId,
    practiceSessionId: args.sessionId,
    questionId: args.questionId,
    status: "pending",
    expiresAt,
  });
  return { token, expiresAt };
}

// ─────────────────────── status (authed desktop poll) ────────────────────────

export type UploadSlotStatus = {
  status: "none" | "pending" | "uploaded" | "consumed";
  token: string | null;
  photoCount: number;
  expiresAt: Date | null;
};

/** The desktop's 3s poll: the latest token for a (session, question) slot. */
export async function getUploadStatus(
  tx: Tx,
  args: { sessionId: string; questionId: string; appUserId: string },
): Promise<UploadSlotStatus> {
  const [row] = await tx
    .select()
    .from(uploadToken)
    .where(
      and(
        eq(uploadToken.appUserId, args.appUserId),
        eq(uploadToken.practiceSessionId, args.sessionId),
        eq(uploadToken.questionId, args.questionId),
      ),
    )
    .orderBy(sql`${uploadToken.createdAt} desc`)
    .limit(1);
  if (!row) return { status: "none", token: null, photoCount: 0, expiresAt: null };
  return {
    status: row.status as UploadSlotStatus["status"],
    token: row.token,
    photoCount: row.uploadKeys.length,
    expiresAt: row.expiresAt,
  };
}

// ─────────────────────── phone side (UNAUTHENTICATED) ─────────────────────────

/** Global read by token string; throws UploadError on missing/expired. */
async function resolveToken(token: string) {
  const [row] = await db
    .select()
    .from(uploadToken)
    .where(eq(uploadToken.token, token))
    .limit(1);
  if (!row) throw new UploadError(404, "TOKEN_NOT_FOUND");
  if (row.expiresAt.getTime() <= Date.now()) throw new UploadError(410, "TOKEN_EXPIRED");
  return row;
}

export type PhoneTokenView = {
  status: string;
  stem: string;
  photoCount: number;
  expiresAt: string;
};

/** What the phone page shows on load (validate + the question stem — NOT a
 *  secret; the reference answer is never read here). */
export async function getUploadTokenForPhone(token: string): Promise<PhoneTokenView> {
  const row = await resolveToken(token);
  // The stem lives on `question` (RLS) — read it under the token's board claim.
  const stem = await withBoard(row.boardId, async (tx) => {
    const [q] = await tx
      .select({ stem: question.stem })
      .from(question)
      .where(eq(question.id, row.questionId))
      .limit(1);
    return q?.stem ?? "";
  });
  return {
    status: row.status,
    stem,
    photoCount: row.uploadKeys.length,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export interface IncomingPhoto {
  bytes: Uint8Array;
  mime: string;
}

/** The phone POST: store the photos, flip the token to 'uploaded'. Only a
 *  'pending' token accepts an upload (single batch, v0). */
export async function recordPhoneUpload(
  token: string,
  photos: IncomingPhoto[],
): Promise<{ photoCount: number }> {
  const row = await resolveToken(token);
  if (row.status !== "pending") throw new UploadError(409, "ALREADY_UPLOADED");
  if (photos.length === 0) throw new UploadError(400, "NO_FILES");
  if (photos.length > MAX_PHOTOS) throw new UploadError(413, "TOO_MANY_FILES");
  for (const p of photos) {
    if (!p.mime.startsWith("image/")) throw new UploadError(415, "NOT_AN_IMAGE");
  }

  const keys: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const key = uploadKeyFor(token, i, photos[i]!.mime);
    await putObject(key, photos[i]!.bytes, photos[i]!.mime);
    keys.push(key);
  }

  // upload_token is global (no RLS) — update via the base client. Guard on
  // status='pending' so a racing second POST can't clobber (single-use upload).
  const updated = await db
    .update(uploadToken)
    .set({ status: "uploaded", uploadKeys: keys, uploadedAt: new Date() })
    .where(and(eq(uploadToken.token, token), eq(uploadToken.status, "pending")))
    .returning({ id: uploadToken.id });
  if (updated.length === 0) throw new UploadError(409, "ALREADY_UPLOADED");
  return { photoCount: keys.length };
}

// ─────────────────── consume (authed desktop submit) ────────────────────────

export interface ConsumedPhotos {
  storageKey: string;
  mime: string;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
};

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Atomically consume an 'uploaded' token into the caller's attempt. Single-use:
 * the update is guarded on status='uploaded', so a double-submit finds nothing
 * and throws. Validates the token matches (user, session, question) first (no
 * cross-slot reuse). Returns the stored photo keys + mimes for attempt_image.
 */
export async function consumeUploadToken(
  tx: Tx,
  args: {
    token: string;
    sessionId: string;
    questionId: string;
    appUserId: string;
  },
): Promise<ConsumedPhotos[]> {
  const [row] = await tx
    .select()
    .from(uploadToken)
    .where(eq(uploadToken.token, args.token))
    .limit(1);
  if (!row) throw new UploadNotReadyError("no such upload token");
  if (
    row.appUserId !== args.appUserId ||
    row.practiceSessionId !== args.sessionId ||
    row.questionId !== args.questionId
  ) {
    throw new UploadNotReadyError("upload token does not match this answer slot");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new UploadNotReadyError("upload token expired");
  }

  const consumed = await tx
    .update(uploadToken)
    .set({ status: "consumed", consumedAt: new Date() })
    .where(and(eq(uploadToken.token, args.token), eq(uploadToken.status, "uploaded")))
    .returning({ keys: uploadToken.uploadKeys });
  if (consumed.length === 0) {
    throw new UploadNotReadyError("upload token is not in an uploaded state");
  }
  return consumed[0]!.keys.map((storageKey) => ({
    storageKey,
    mime: mimeFromKey(storageKey),
  }));
}
