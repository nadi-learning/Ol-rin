/**
 * Parent-dashboard COPY OVERRIDES — D-PDASH-3's other half (S168).
 *
 * The ruling was "CODE ships the full default map; a DB row OVERRIDES per key; a
 * missing/failed key FALLS BACK to the built-in default and NEVER renders blank."
 * `@b2c/kernel/parent-copy` shipped the code half in S159; this is the DB half,
 * so the founder can retune the voice a parent reads without a deploy.
 *
 * TWO SCOPES since S169 (founder ruling D-PDASH-8), resolved in one chain:
 *
 *     code default  →  board override (student_id NULL)  →  student override
 *
 * The board row is the voice every parent on that board reads; a student row
 * retunes ONE child's page on top of it. Both live in the same table under the
 * same board_id — `student_id` narrows within a board, it never crosses one.
 * Reads are RLS-scoped, so every call here runs under `withBoard` and simply
 * cannot see another board's voice.
 *
 * ── The one thing this module exists to prevent ──────────────────────────────
 * `fillCopy` THROWS on a `{token}` the caller didn't supply — deliberately, so a
 * broken string can never render "{total}" to a parent. But the call sites are
 * FIXED in code: `copy("section.map.title", { name })` supplies exactly `name`.
 * So an override reading "How {name} is doing in {subject}" would throw at RENDER
 * — and because `copy()` is called during the portfolio's render, that is not a
 * blank string, it is a **blank dashboard** for every parent on that board.
 *
 * Hence `assertTokensAreSafe`: an override's tokens must be a SUBSET of the
 * default's. Fewer is fine (drop `{name}` if you want a plainer heading); a NEW
 * one is refused at save time, which is exactly where parent-copy.ts's header
 * said this check belonged.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, parentCopy, student } from "@b2c/kernel/schema";
import {
  PARENT_COPY_DEFAULTS,
  placeholdersOf,
  type ParentCopyKey,
} from "@b2c/kernel/parent-copy";

type Tx = PgTransaction<any, any, any>;

/** A copy key that isn't in the default map — nothing would ever read it. */
export class UnknownCopyKeyError extends Error {
  code = "UNKNOWN_COPY_KEY" as const;
  constructor(key: string) {
    super(`no such parent-copy key: ${key}`);
  }
}

/** The override introduces a placeholder no call site supplies (see header). */
export class UnsafeCopyTokensError extends Error {
  code = "UNSAFE_COPY_TOKENS" as const;
  constructor(
    public readonly key: string,
    public readonly offending: string[],
    public readonly allowed: string[],
  ) {
    super(
      `override for "${key}" uses {${offending.join("}, {")}} — only {${
        allowed.join("}, {")
      }} are supplied at the call site` + (allowed.length ? "" : " (this string takes no placeholders)"),
    );
  }
}

/** A `studentId` that isn't a student on the claimed board. */
export class UnknownCopyStudentError extends Error {
  code = "UNKNOWN_COPY_STUDENT" as const;
  constructor(studentId: string) {
    super(`no such student on this board: ${studentId}`);
  }
}

export type ParentCopyRow = {
  key: ParentCopyKey;
  value: string;
  updatedAt: string | null;
};

/** Every key at the requested scope, with everything the editor needs to decide. */
export type ParentCopyEntry = {
  key: ParentCopyKey;
  /** The string that ships in code — the floor of the chain, never blank. */
  default: string;
  /** The override AT THE REQUESTED SCOPE (board row, or the student's own row). */
  override: string | null;
  /**
   * What this key would read if `override` were cleared: the board's value when
   * editing a student, the code default when editing the board. The editor shows
   * it as "reverts to", so clearing is a decision made with the alternative
   * visible — the same reason the board-scope panel always showed the default.
   */
  inherited: string;
  /** Set when editing a student AND the board has its own override for this key. */
  boardOverride: string | null;
  /** Placeholders the call site supplies — the editor shows these as the budget. */
  tokens: string[];
};

/** One row of the student picker in the Copy tab. */
export type ParentCopyStudent = {
  studentId: string;
  name: string | null;
  email: string;
  class: string;
  /** Nobody reads this child's page yet — worth showing before an edit is made. */
  hasParent: boolean;
  /** How many keys this student already overrides (0 = purely the board voice). */
  overrides: number;
};

function assertKnown(key: string): asserts key is ParentCopyKey {
  if (!(key in PARENT_COPY_DEFAULTS)) throw new UnknownCopyKeyError(key);
}

/**
 * The student must be a student ON THIS BOARD. The read is RLS-scoped, so a
 * student id from another board comes back empty and is refused here — a
 * board-crossing write is impossible rather than merely discouraged.
 */
async function assertStudentOnBoard(tx: Tx, studentId: string): Promise<void> {
  const rows = await tx
    .select({ userId: student.userId })
    .from(student)
    .where(eq(student.userId, studentId))
    .limit(1);
  if (rows.length === 0) throw new UnknownCopyStudentError(studentId);
}

function assertTokensAreSafe(key: ParentCopyKey, value: string): void {
  const allowed = placeholdersOf(PARENT_COPY_DEFAULTS[key]);
  const used = [...new Set(placeholdersOf(value))];
  const offending = used.filter((t) => !allowed.includes(t));
  if (offending.length) throw new UnsafeCopyTokensError(key, offending, allowed);
}

/**
 * The overrides that apply to ONE reader, already collapsed: this board's rows,
 * then (when `studentId` is given) that child's rows layered on top. The ONE
 * read the dashboard needs — it ships in the payload so the FE (which resolves
 * most copy locally, client-side) applies exactly what the server would.
 *
 * Pass the CHILD being rendered, not the parent: the override is attached to the
 * student whose page it retunes, and a parent with three children must read each
 * child's own voice.
 */
export async function readParentCopyOverrides(
  tx: Tx,
  studentId?: string | null,
): Promise<Record<string, string>> {
  // No board filter: `parent_copy` is RLS'd + FORCEd, so this select can only
  // ever see the board claimed by the enclosing `withBoard`. An EMPTY result is
  // the normal "this board hasn't overridden anything" case, not a lost read
  // (M80) — every key falls back to its code default by design.
  const rows = await tx
    .select({ key: parentCopy.key, value: parentCopy.value, studentId: parentCopy.studentId })
    .from(parentCopy);
  const out: Record<string, string> = {};
  // Board rows FIRST, then this student's — applying them in that order is what
  // makes the student value win. Rows belonging to any OTHER student are skipped.
  const scopes: (string | null)[] = studentId ? [null, studentId] : [null];
  for (const scope of scopes) {
    for (const r of rows) {
      if ((r.studentId ?? null) !== scope) continue;
      // A row whose key no longer exists in the code map is INERT, not an error —
      // a copy refactor must not break the dashboard (D-PDASH-3's "never blank").
      if (r.key in PARENT_COPY_DEFAULTS) out[r.key] = r.value;
    }
  }
  return out;
}

/**
 * The admin editor's view of ONE scope: every key, its code default, the row at
 * this scope, and what clearing that row would fall back to.
 *
 * `studentId` null/absent = the board's default voice. Set = that child's page.
 */
export async function listParentCopy(
  tx: Tx,
  args: { studentId?: string | null } = {},
): Promise<ParentCopyEntry[]> {
  const studentId = args.studentId ?? null;
  if (studentId) await assertStudentOnBoard(tx, studentId);

  const boardRows = await readParentCopyOverrides(tx, null);
  const scopeRows = studentId ? await readStudentOnlyOverrides(tx, studentId) : boardRows;

  return (Object.keys(PARENT_COPY_DEFAULTS) as ParentCopyKey[]).map((key) => {
    const def = PARENT_COPY_DEFAULTS[key];
    const boardOverride = studentId ? (boardRows[key] ?? null) : null;
    return {
      key,
      default: def,
      override: scopeRows[key] ?? null,
      // Editing a student, clearing drops to the board's voice (or the default);
      // editing the board, it drops to the code default. Never blank either way.
      inherited: studentId ? (boardRows[key] ?? def) : def,
      boardOverride,
      tokens: placeholdersOf(def),
    };
  });
}

/** Just this student's OWN rows — not merged with the board's (the editor needs both apart). */
async function readStudentOnlyOverrides(tx: Tx, studentId: string): Promise<Record<string, string>> {
  const rows = await tx
    .select({ key: parentCopy.key, value: parentCopy.value })
    .from(parentCopy)
    .where(eq(parentCopy.studentId, studentId));
  const out: Record<string, string> = {};
  for (const r of rows) if (r.key in PARENT_COPY_DEFAULTS) out[r.key] = r.value;
  return out;
}

/**
 * The picker feed: every student on this board, with whether a parent can
 * actually read their page and how many keys they already override.
 */
export async function listParentCopyStudents(tx: Tx): Promise<ParentCopyStudent[]> {
  // RLS-scoped to the claimed board via student.board_id.
  const rows = await tx
    .select({
      studentId: student.userId,
      name: appUser.name,
      email: appUser.email,
      class: student.class,
      parentId: student.parentId,
    })
    .from(student)
    .innerJoin(appUser, eq(appUser.id, student.userId))
    .where(eq(student.status, "active"))
    .orderBy(asc(appUser.name), asc(appUser.email));

  // Every row on this board; the board-level ones (student_id NULL) are dropped
  // in the fold below. One read beats one-per-student.
  const counts = await tx
    .select({ studentId: parentCopy.studentId, key: parentCopy.key })
    .from(parentCopy);

  const perStudent = new Map<string, number>();
  for (const c of counts) {
    if (!c.studentId) continue; // board-level row
    if (!(c.key in PARENT_COPY_DEFAULTS)) continue; // stale key — inert, don't count it
    perStudent.set(c.studentId, (perStudent.get(c.studentId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    studentId: r.studentId,
    name: r.name,
    email: r.email,
    class: r.class,
    hasParent: r.parentId !== null,
    overrides: perStudent.get(r.studentId) ?? 0,
  }));
}

/**
 * Set or CLEAR one key's override at ONE scope — the board (`studentId` absent)
 * or a single child (`studentId` set).
 *
 * An empty/whitespace value DELETES the row rather than storing "" — reverting
 * is the operation an editor actually wants, and a stored empty string would
 * render a blank heading to a parent, which D-PDASH-3 explicitly forbids ("NEVER
 * renders blank"). Clearing a STUDENT row drops that child back to the board's
 * voice, not to the code default: the chain is resolved on read, so removing one
 * link exposes the next, and there is still no blank state anywhere in it.
 */
export async function setParentCopy(
  tx: Tx,
  args: {
    boardId: string;
    studentId?: string | null;
    key: string;
    value: string | null;
    actorId: string;
  },
): Promise<{ key: string; studentId: string | null; override: string | null }> {
  const { boardId, key, actorId } = args;
  const studentId = args.studentId ?? null;
  assertKnown(key);
  if (studentId) await assertStudentOnBoard(tx, studentId);
  const value = (args.value ?? "").trim();

  // `student_id IS NULL` needs isNull(), not eq(…, null) — eq would render
  // `= NULL`, which is never true, so a board-level clear would silently match
  // NOTHING and the override would appear stuck (M80's family).
  const atScope = and(
    eq(parentCopy.boardId, boardId),
    eq(parentCopy.key, key),
    studentId ? eq(parentCopy.studentId, studentId) : isNull(parentCopy.studentId),
  );

  if (!value) {
    await tx.delete(parentCopy).where(atScope);
    return { key, studentId, override: null };
  }

  assertTokensAreSafe(key, value);
  await tx
    .insert(parentCopy)
    .values({ boardId, studentId, key, value, updatedBy: actorId })
    .onConflictDoUpdate({
      // Matches the NULLS NOT DISTINCT unique constraint, so a board-level row
      // (student_id NULL) is inferred and UPDATEd rather than duplicated.
      target: [parentCopy.boardId, parentCopy.studentId, parentCopy.key],
      set: { value, updatedBy: actorId, updatedAt: new Date() },
    });
  return { key, studentId, override: value };
}
