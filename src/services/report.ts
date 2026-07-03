/**
 * Parent sign-off reports (Slice Report-Signoff) — the deferred half of Polaris
 * #4 (D-P-1). The live Parent surface (Slice P) shows current data directly;
 * this adds the vetted layer: a tutor ASSEMBLES a linked child's progress into a
 * FROZEN snapshot (a draft), then SIGNS IT OFF → published to the parent. The
 * parent's "Reports" list shows only PUBLISHED reports — exactly what the tutor
 * approved, not data that drifted afterward.
 *
 * Forks locked (this slice):
 *  - tutor-only sign-off (v0). admin/founder approval is a separable middle gate
 *    (the `admin` role exists in the enum but has no surface yet). Same thin-
 *    vertical reasoning D-P-1 used to defer sign-off itself.
 *  - FROZEN snapshot, not live-with-a-flag. `report.snapshot` is an immutable
 *    jsonb of { child, metrics, mastery } captured at assemble time — the whole
 *    semantic of sign-off. Re-assembling makes a NEW report (append-only).
 *  - no LLM summary (pure-code assembly + a tutor free-text note). The weekly
 *    LLM summary is a clean add-on later (#4 marks it optional).
 *  - the live dashboard stays — this is additive (a parent "Reports" section).
 *
 * Two access boundaries, both load-bearing (mirrors Slice T/P):
 *  - ROLE gate (M11): tutor reads via tutorProcedure, parent reads via
 *    parentProcedure (the CHECK sides assertTutor / assertParent).
 *  - OWNERSHIP guard (D-L-5): RLS scopes by board, NOT user. The tutor side
 *    asserts a tutor_student link (assertTutorsStudent); the parent side asserts
 *    a parent_child link (assertParentsChild). A report for an un-owned student/
 *    child — or a tutor's DRAFT seen by a parent — is REPORT_NOT_FOUND (no leak).
 *
 * THE published GATE, both sides (M11): publishReport is the only place a report
 * becomes 'published' (the SET side); every parent read filters status =
 * 'published' (the CHECK side). The probe proves a draft is invisible to the
 * parent and becomes visible only after publish.
 *
 * THE M11 projection boundary: the snapshot is built by computeChildReport
 * (parent.ts) — the SAME read the live parent surface uses, which selects the
 * user-visible `description` and NEVER the internal mastery `log`. So no internal
 * blob can leak into a frozen report either.
 *
 * Runs inside the board-scoped tx (tutor/parentProcedure → withBoard): every
 * report read/write is RLS-gated to the active board.
 */
import { and, desc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUser, eventLog, report } from "@b2c/kernel/schema";
import { type ChildReport, computeChildReport } from "./parent";
import { assertParentsChild } from "./parent";
import { assertTutorsStudent } from "./tutor";

type Tx = PgTransaction<any, any, any>;

// event_log.event_type written when a report is signed off (kernel EventType).
export const REPORT_PUBLISHED_EVENT = "report_published";

export class ReportNotFoundError extends Error {
  readonly code = "REPORT_NOT_FOUND";
  constructor(reportId: string) {
    super(`report ${reportId} not found / not accessible`);
    this.name = "ReportNotFoundError";
  }
}

export class ReportAlreadyPublishedError extends Error {
  readonly code = "REPORT_ALREADY_PUBLISHED";
  constructor(reportId: string) {
    super(`report ${reportId} is already published`);
    this.name = "ReportAlreadyPublishedError";
  }
}

export type ReportStatus = "draft" | "published";

/** A report row without the (heavy) frozen snapshot — for list views. */
export type ReportSummary = {
  id: string;
  studentId: string;
  tutorId: string;
  status: ReportStatus;
  tutorNote: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

/** A report row WITH the frozen snapshot — for the review / read screen. */
export type ReportDetail = ReportSummary & { snapshot: ChildReport };

const SUMMARY_COLS = {
  id: report.id,
  studentId: report.studentId,
  tutorId: report.tutorId,
  status: report.status,
  tutorNote: report.tutorNote,
  createdAt: report.createdAt,
  publishedAt: report.publishedAt,
} as const;

function asSummary(r: {
  id: string;
  studentId: string;
  tutorId: string;
  status: string;
  tutorNote: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}): ReportSummary {
  return { ...r, status: r.status as ReportStatus };
}

/**
 * TUTOR — assemble a linked student's progress into a FROZEN draft report. Reads
 * the live mastery + trend + metrics via computeChildReport (so the snapshot is
 * byte-for-byte what the parent surface shows, log-excluded) and stores it
 * immutably. Returns the draft detail for the tutor to review before signing off.
 */
export async function assembleReport(
  tx: Tx,
  args: { boardId: string; tutorUserId: string; studentId: string },
): Promise<ReportDetail> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  // The tutor_student link guarantees the app_user exists; fetch the summary so
  // the snapshot is self-contained (frozen child identity too).
  const [student] = await tx
    .select({
      studentId: appUser.id,
      name: appUser.name,
      email: appUser.email,
    })
    .from(appUser)
    .where(eq(appUser.id, args.studentId))
    .limit(1);
  if (!student) throw new Error(`app_user ${args.studentId} missing`);

  const snapshot = await computeChildReport(tx, student);

  const [row] = await tx
    .insert(report)
    .values({
      boardId: args.boardId,
      studentId: args.studentId,
      tutorId: args.tutorUserId,
      status: "draft",
      snapshot,
    })
    .returning(SUMMARY_COLS);
  return { ...asSummary(row!), snapshot };
}

/**
 * TUTOR — sign off a draft → published (the SET side of the published gate, M11).
 * Author-only (the report's tutor_id must equal the caller; RLS already scopes to
 * the board). Records a report_published event_log row. Re-publishing a published
 * report is rejected (ReportAlreadyPublishedError). Returns the published detail.
 */
export async function publishReport(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    reportId: string;
    tutorNote?: string | null;
  },
): Promise<ReportDetail> {
  const [row] = await tx
    .select({ ...SUMMARY_COLS, snapshot: report.snapshot })
    .from(report)
    .where(
      and(eq(report.id, args.reportId), eq(report.tutorId, args.tutorUserId)),
    )
    .limit(1);
  if (!row) throw new ReportNotFoundError(args.reportId);
  if (row.status === "published")
    throw new ReportAlreadyPublishedError(args.reportId);

  const [updated] = await tx
    .update(report)
    .set({
      status: "published",
      publishedAt: sql`now()`,
      tutorNote: args.tutorNote ?? null,
    })
    .where(eq(report.id, args.reportId))
    .returning(SUMMARY_COLS);

  await tx.insert(eventLog).values({
    boardId: args.boardId,
    eventType: REPORT_PUBLISHED_EVENT,
    studentId: row.studentId,
    tutorId: args.tutorUserId,
    payload: { reportId: args.reportId },
  });

  return { ...asSummary(updated!), snapshot: row.snapshot as ChildReport };
}

/**
 * TUTOR — the reports the caller has authored for one student (newest first),
 * drafts + published. Summaries only (the list is light). Ownership-gated.
 */
export async function listReportsForTutor(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<ReportSummary[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const rows = await tx
    .select(SUMMARY_COLS)
    .from(report)
    .where(
      and(
        eq(report.studentId, args.studentId),
        eq(report.tutorId, args.tutorUserId),
      ),
    )
    .orderBy(desc(report.createdAt));
  return rows.map(asSummary);
}

/**
 * TUTOR — one report (with snapshot) the caller authored, for re-review. Author-
 * scoped + RLS board-scoped; anything else → REPORT_NOT_FOUND.
 */
export async function getReportForTutor(
  tx: Tx,
  args: { tutorUserId: string; reportId: string },
): Promise<ReportDetail> {
  const [row] = await tx
    .select({ ...SUMMARY_COLS, snapshot: report.snapshot })
    .from(report)
    .where(
      and(eq(report.id, args.reportId), eq(report.tutorId, args.tutorUserId)),
    )
    .limit(1);
  if (!row) throw new ReportNotFoundError(args.reportId);
  return { ...asSummary(row), snapshot: row.snapshot as ChildReport };
}

/**
 * PARENT — a linked child's PUBLISHED reports (the CHECK side of the published
 * gate, M11 — drafts are invisible). Newest published first. Ownership-gated via
 * parent_child; a child the caller isn't a parent of → ChildNotFoundError.
 */
export async function listReportsForParent(
  tx: Tx,
  args: { parentUserId: string; childId: string },
): Promise<ReportSummary[]> {
  await assertParentsChild(tx, args.parentUserId, args.childId);
  const rows = await tx
    .select(SUMMARY_COLS)
    .from(report)
    .where(
      and(eq(report.studentId, args.childId), eq(report.status, "published")),
    )
    .orderBy(desc(report.publishedAt));
  return rows.map(asSummary);
}

/**
 * PARENT — one PUBLISHED report (with the frozen snapshot) for a linked child.
 * A draft, a non-published report, or a report for another child → NOT_FOUND
 * (no existence leak). Ownership-gated via parent_child + the published filter.
 */
export async function getReportForParent(
  tx: Tx,
  args: { parentUserId: string; childId: string; reportId: string },
): Promise<ReportDetail> {
  await assertParentsChild(tx, args.parentUserId, args.childId);
  const [row] = await tx
    .select({ ...SUMMARY_COLS, snapshot: report.snapshot })
    .from(report)
    .where(
      and(
        eq(report.id, args.reportId),
        eq(report.studentId, args.childId),
        eq(report.status, "published"),
      ),
    )
    .limit(1);
  if (!row) throw new ReportNotFoundError(args.reportId);
  return { ...asSummary(row), snapshot: row.snapshot as ChildReport };
}
