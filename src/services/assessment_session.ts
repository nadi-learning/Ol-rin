/**
 * Slice S2R-2 — the Stage-2 assessment SESSION: one sitting per assignment.
 *
 * Replaces the per-sub_topic draft-then-form path (D-S2R-5, HARD CUT). The tutor
 * no longer certifies one sub-topic at a time from a flat worklist; they open a
 * sitting that covers a whole assignment's composition, see all N proposals
 * together, and commit them in ONE atomic act (D-S2R-1).
 *
 * THE THREE MOVES:
 *   1. list    — what is waiting: one entry per completed assignment with pending
 *                evidence, plus the CATCH-ALL entry (D-S2R-7).
 *   2. open    — freeze the composition, fire all N Stage-2a drafts in PARALLEL,
 *                persist them on the row. Idempotent: re-opening returns the
 *                existing sitting rather than re-billing N Gemini calls.
 *   3. finalize— ONE transaction commits all N sub-topics, or none (D-S2R-1),
 *                and runs Stage-2b's SYNTHESIS in the same tx (D-S2R-3, S2R-3).
 *                Accept-all is the fast path and works from day one (D-S2R-2).
 *
 * WHAT STAGE 2a KEEPS: each draft call still sees ONLY its own sub-topic's
 * observations (gatherStage2Input is per-sub_topic). The certification silo is
 * enforced BY CONSTRUCTION, not by prompt discipline — the shared, cross-topic
 * context arrives only with Stage-2b's chat (S2R-4), which is deliberately kept
 * out of the call that moves the rungs.
 *
 * WHAT IS STILL MISSING: the Stage-2b CHAT (S2R-4) — `messages` is on the row and
 * nothing reads it yet. Synthesis (S2R-3) now runs at finalize, so D-S2R-3 binds
 * for real: the accept-all fast path writes the chapter/subject insights and the
 * horizontals too, because a tutor skipping the conversation must not silently
 * strand every store above the sub-topic.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { ChatMessage } from "@b2c/kernel/contracts";
import {
  assessmentSession,
  assignment,
  chapter,
  practiceSession,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import {
  type Stage2Draft,
  type Stage2DraftResult,
  finalizeStage2,
  gatherStage2Input,
  normalizeDate,
  runStage2Call,
} from "./assessment";
import {
  type SynthesisResult,
  type SynthesisWriteResult,
  gatherSynthesisInput,
  runSynthesisCall,
  writeSynthesis,
} from "./synthesis";
import { assertTutorsStudent, pendingSubTopicMap } from "./tutor";

type Tx = PgTransaction<any, any, any>;

export class AssessmentSessionNotFoundError extends Error {
  readonly code = "ASSESSMENT_SESSION_NOT_FOUND";
  constructor(id: string) {
    super(`no assessment_session ${id} for this tutor`);
    this.name = "AssessmentSessionNotFoundError";
  }
}

export class SessionAlreadyFinalizedError extends Error {
  readonly code = "SESSION_ALREADY_FINALIZED";
  constructor(id: string) {
    super(`assessment_session ${id} is already finalized`);
    this.name = "SessionAlreadyFinalizedError";
  }
}

export class NothingToAssessError extends Error {
  readonly code = "NOTHING_TO_ASSESS";
  constructor() {
    super("no pending observations to assess");
    this.name = "NothingToAssessError";
  }
}

/** A sitting that is waiting to be opened, or is already open. */
export type PendingAssessment = {
  /** null until the sitting is opened. */
  sessionId: string | null;
  /** null = the catch-all sitting for unassigned evidence (D-S2R-7). */
  assignmentId: string | null;
  kind: "assignment" | "catch_all";
  label: string;
  subTopicIds: string[];
  subTopicNames: string[];
  pendingCount: number;
  status: "not_opened" | "open" | "finalized";
};

/** The `drafts` jsonb shape: subTopicId → the 2a proposal for it. */
export type SessionDrafts = Record<string, Stage2DraftResult>;

export type AssessmentSessionView = {
  id: string;
  studentId: string;
  assignmentId: string | null;
  kind: "assignment" | "catch_all";
  status: "open" | "finalized";
  subTopicIds: string[];
  drafts: SessionDrafts;
  /** S2R-4 — the 2b chat, oldest first. [] until the tutor opens the chat. */
  messages: ChatMessage[];
  /** S2R-3 — 2b's synthesis + its reasoning. Null until finalized (spec §6). */
  synthesis: (SynthesisResult & { dropped: string[] }) | null;
  finalizedAt: Date | null;
  createdAt: Date;
};

/** The messages jsonb, validated. A malformed row should fail loudly here, not
 *  render as a half-parsed transcript (same rule as authoring_chat's). */
export function parseSessionMessages(raw: unknown): ChatMessage[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((m) => ChatMessage.parse(m));
}

function kindOf(assignmentId: string | null): "assignment" | "catch_all" {
  return assignmentId ? "assignment" : "catch_all";
}

/**
 * Which of this student's assignments are DONE. `assignment.status` is stored
 * 'assigned' and never updated — completion is DERIVED (D-ASG-3: every sub_topic
 * in the frozen composition has a completed practice_session). Reading the column
 * would silently return "nothing is ever complete", so it must not be trusted.
 */
async function completedAssignmentIds(tx: Tx, studentId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ id: assignment.id, subTopicIds: assignment.subTopicIds })
    .from(assignment)
    .where(eq(assignment.studentId, studentId));
  if (rows.length === 0) return new Set();

  const sessions = await tx
    .select({
      assignmentId: practiceSession.assignmentId,
      subTopicId: practiceSession.subTopicId,
      status: practiceSession.status,
    })
    .from(practiceSession)
    .where(
      and(
        eq(practiceSession.appUserId, studentId),
        inArray(
          practiceSession.assignmentId,
          rows.map((r) => r.id),
        ),
      ),
    );

  const done = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.assignmentId) continue;
    if (!done.has(s.assignmentId)) done.set(s.assignmentId, new Set());
    done.get(s.assignmentId)!.add(s.subTopicId);
  }

  const out = new Set<string>();
  for (const r of rows) {
    const d = done.get(r.id);
    if (d && r.subTopicIds.every((id) => d.has(id))) out.add(r.id);
  }
  return out;
}

/**
 * What is waiting to be certified for this student.
 *
 * THE PARTITION (D-S2R-7). Start from `pendingSubTopicMap` — the ONE, origin-blind
 * definition of "pending" that the old worklist used — then split it:
 *   - a pending sub_topic covered by a COMPLETED assignment → that assignment's sitting;
 *   - everything left over → the catch-all sitting.
 * Because we partition that one set rather than re-deriving each side, a sub_topic
 * cannot fall through the gap. That is the whole point: self-serve and teach-back
 * evidence reaches a sitting the same way assigned evidence does.
 *
 * A sub_topic in an INCOMPLETE assignment falls to the catch-all rather than
 * waiting for the assignment to finish. Deliberate: an abandoned assignment must
 * not strand real evidence forever. When the assignment does complete, its sitting
 * covers the sub_topic again with the full set — nothing is lost, because
 * gatherStage2Input always reads the sub_topic's WHOLE observation history.
 */
export async function listPendingAssessments(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<PendingAssessment[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  const pending = await pendingSubTopicMap(tx, args.studentId);
  const open = await tx
    .select()
    .from(assessmentSession)
    .where(
      and(
        eq(assessmentSession.studentId, args.studentId),
        eq(assessmentSession.status, "open"),
      ),
    );
  const openByAssignment = new Map<string | null, typeof open[number]>();
  for (const s of open) openByAssignment.set(s.assignmentId, s);

  if (pending.size === 0 && open.length === 0) return [];

  const completed = await completedAssignmentIds(tx, args.studentId);
  const assignments = completed.size
    ? await tx
        .select()
        .from(assignment)
        .where(
          and(
            eq(assignment.studentId, args.studentId),
            inArray(assignment.id, [...completed]),
          ),
        )
    : [];

  // Name every sub_topic we might mention, in one read.
  const allIds = new Set<string>(pending.keys());
  for (const s of open) for (const id of s.subTopicIds) allIds.add(id);
  const names = allIds.size
    ? await tx
        .select({
          id: subTopic.id,
          name: subTopic.name,
          chapterName: chapter.name,
          subjectName: subject.name,
        })
        .from(subTopic)
        .innerJoin(topic, eq(topic.id, subTopic.topicId))
        .innerJoin(chapter, eq(chapter.id, topic.chapterId))
        .innerJoin(subject, eq(subject.id, chapter.subjectId))
        .where(inArray(subTopic.id, [...allIds]))
    : [];
  const nameById = new Map(names.map((n) => [n.id, n]));

  const out: PendingAssessment[] = [];
  const claimed = new Set<string>();

  for (const a of assignments) {
    const mine = a.subTopicIds.filter((id) => pending.has(id));
    const existing = openByAssignment.get(a.id);
    if (mine.length === 0 && !existing) continue;
    for (const id of mine) claimed.add(id);
    // An open sitting keeps its FROZEN composition; an unopened one previews
    // what is pending right now.
    const ids = existing ? existing.subTopicIds : mine;
    for (const id of ids) claimed.add(id);
    out.push({
      sessionId: existing?.id ?? null,
      assignmentId: a.id,
      kind: "assignment",
      label:
        a.mode === "blocked"
          ? `${nameById.get(ids[0]!)?.chapterName ?? "Assignment"} · blocked`
          : `${nameById.get(ids[0]!)?.subjectName ?? "Assignment"} · interleaved`,
      subTopicIds: ids,
      subTopicNames: ids.map((id) => nameById.get(id)?.name ?? id),
      pendingCount: ids.reduce((n, id) => n + (pending.get(id)?.pendingCount ?? 0), 0),
      status: existing ? "open" : "not_opened",
      });
  }

  // The catch-all: everything no assignment sitting claimed.
  const loose = [...pending.keys()].filter((id) => !claimed.has(id));
  const openCatchAll = openByAssignment.get(null);
  if (loose.length || openCatchAll) {
    const ids = openCatchAll ? openCatchAll.subTopicIds : loose;
    out.push({
      sessionId: openCatchAll?.id ?? null,
      assignmentId: null,
      kind: "catch_all",
      label: "Other practice",
      subTopicIds: ids,
      subTopicNames: ids.map((id) => nameById.get(id)?.name ?? id),
      pendingCount: ids.reduce((n, id) => n + (pending.get(id)?.pendingCount ?? 0), 0),
      status: openCatchAll ? "open" : "not_opened",
    });
  }

  return out;
}

function toView(row: typeof assessmentSession.$inferSelect): AssessmentSessionView {
  return {
    id: row.id,
    studentId: row.studentId,
    assignmentId: row.assignmentId,
    kind: kindOf(row.assignmentId),
    status: row.status as "open" | "finalized",
    subTopicIds: row.subTopicIds,
    drafts: row.drafts as SessionDrafts,
    messages: parseSessionMessages(row.messages),
    synthesis: (row.synthesis as AssessmentSessionView["synthesis"]) ?? null,
    finalizedAt: row.finalizedAt,
    createdAt: row.createdAt,
  };
}

/**
 * Open a sitting: freeze the composition, draft all N sub-topics in PARALLEL,
 * persist the proposals on the row.
 *
 * IDEMPOTENT — an existing OPEN sitting is returned as-is. This is not a nicety:
 * each open costs N real Gemini calls, so a double-click or a re-render must not
 * re-bill them (and must not hand the tutor a different set of numbers to the one
 * they are already looking at).
 *
 * The N calls are fanned out only AFTER every DB read is done, because they run
 * on the caller's single transaction — see gatherStage2Input's note. All-or-
 * nothing: if any call fails the whole open fails and no row is written, leaving
 * a clean retry rather than a half-drafted sitting the tutor cannot finalize.
 * (geminiJson already retries once internally, so this is not one flake = one
 * lost sitting.)
 */
export async function openAssessmentSession(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    studentId: string;
    assignmentId: string | null;
  },
): Promise<AssessmentSessionView> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  const [existing] = await tx
    .select()
    .from(assessmentSession)
    .where(
      and(
        eq(assessmentSession.studentId, args.studentId),
        eq(assessmentSession.status, "open"),
        args.assignmentId
          ? eq(assessmentSession.assignmentId, args.assignmentId)
          : isNull(assessmentSession.assignmentId),
      ),
    );
  if (existing) return toView(existing);

  // Compose from the SAME partition the list shows, so what the tutor clicked is
  // what they get.
  const listed = await listPendingAssessments(tx, {
    tutorUserId: args.tutorUserId,
    studentId: args.studentId,
  });
  const entry = listed.find((e) => e.assignmentId === args.assignmentId);
  if (!entry || entry.subTopicIds.length === 0) throw new NothingToAssessError();

  // 1. Gather every input sequentially — pure reads on the tx.
  const inputs = [];
  for (const subTopicId of entry.subTopicIds) {
    inputs.push({
      subTopicId,
      ...(await gatherStage2Input(tx, {
        tutorUserId: args.tutorUserId,
        studentId: args.studentId,
        subTopicId,
      })),
    });
  }

  // 2. Fan out the N Gemini calls together — no DB inside (D-S2R: 2a in parallel).
  const drafted = await Promise.all(
    inputs.map(async (i) => ({
      subTopicId: i.subTopicId,
      result: {
        subTopicId: i.subTopicId,
        subTopicName: i.subTopicName,
        observationCount: i.observationCount,
        current: i.current,
        draft: await runStage2Call(i.input).then((d) => ({
          ...d,
          climbNextDue: normalizeDate(d.climbNextDue),
        })),
      } satisfies Stage2DraftResult,
    })),
  );

  const drafts: SessionDrafts = {};
  for (const d of drafted) drafts[d.subTopicId] = d.result;

  const [row] = await tx
    .insert(assessmentSession)
    .values({
      boardId: args.boardId,
      studentId: args.studentId,
      tutorId: args.tutorUserId,
      assignmentId: args.assignmentId,
      subTopicIds: entry.subTopicIds,
      drafts,
      messages: [],
      status: "open",
    })
    .returning();

  return toView(row!);
}

/** Read one sitting. Survives finalize — the tutor can review the reasoning after
 *  the fact (spec §6: hidden reasoning defeats the point). */
export async function getAssessmentSession(
  tx: Tx,
  args: { tutorUserId: string; sessionId: string },
): Promise<AssessmentSessionView> {
  const [row] = await tx
    .select()
    .from(assessmentSession)
    .where(eq(assessmentSession.id, args.sessionId));
  if (!row) throw new AssessmentSessionNotFoundError(args.sessionId);
  // Ownership: RLS scopes by board, not by tutor — assert the link like every
  // other per-student read, and report a foreign sitting as not-found.
  try {
    await assertTutorsStudent(tx, args.tutorUserId, row.studentId);
  } catch {
    throw new AssessmentSessionNotFoundError(args.sessionId);
  }
  return toView(row);
}

export type SessionFinalizeItem = {
  subTopicId: string;
  final: {
    conceptualLevel: number | null;
    proceduralLevel: number | null;
    description: string;
  };
};

export type SessionFinalizeResult = {
  sessionId: string;
  committed: Array<{
    subTopicId: string;
    conceptualLevel: number | null;
    proceduralLevel: number | null;
    taught: boolean;
    overridden: boolean;
  }>;
  /** S2R-3 — what synthesis wrote above the sub-topic. */
  synthesis: SynthesisWriteResult;
};

/**
 * Commit the whole sitting — ONE ATOMIC FINALIZE (D-S2R-1). Nothing commits
 * until every sub_topic in the sitting has committed: this runs inside the
 * caller's single board-scoped tx, so a throw on sub-topic 3 of 5 rolls back 1
 * and 2 with it. Partial certification is the failure mode this decision exists
 * to make impossible — a half-assessed assignment leaves mastery in a state no
 * tutor chose and no screen shows.
 *
 * `items` carries only the tutor's EDITS (§6's editable set: the two levels +
 * description). Anything not sent is accepted as drafted — that IS the accept-all
 * fast path (D-S2R-2), so an empty/absent `items` finalizes the sitting exactly
 * as proposed, in one click.
 *
 * The AI-authored half (log / dates / reasoning / flags) is read from the sitting
 * row, NOT from the client. The old endpoint round-tripped the draft through the
 * FE and trusted it back; persisting drafts server-side closes that off — a
 * client can now choose the levels, never the reasoning attributed to the model.
 */
export async function finalizeAssessmentSession(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    sessionId: string;
    items?: SessionFinalizeItem[];
  },
): Promise<SessionFinalizeResult> {
  const session = await getAssessmentSession(tx, {
    tutorUserId: args.tutorUserId,
    sessionId: args.sessionId,
  });
  if (session.status === "finalized") {
    throw new SessionAlreadyFinalizedError(args.sessionId);
  }

  const edits = new Map((args.items ?? []).map((i) => [i.subTopicId, i.final]));

  // 1. Resolve what is being certified — the drafts as edited by the tutor.
  //    Nothing is written yet: the finals are fully determined by (drafts, edits),
  //    so synthesis can be handed them BEFORE any row moves. That ordering is what
  //    lets the AI call sit ahead of every write instead of between them.
  const resolved = session.subTopicIds.map((subTopicId) => {
    const proposal = session.drafts[subTopicId];
    // A sitting is only written with a draft per sub_topic, so this is a
    // can't-happen — but it must never degrade into silently skipping a
    // sub_topic the tutor believes they just certified.
    if (!proposal) {
      throw new Error(
        `assessment_session ${args.sessionId} has no draft for sub_topic ${subTopicId}`,
      );
    }
    const draft: Stage2Draft = proposal.draft;
    return {
      subTopicId,
      draft,
      final: edits.get(subTopicId) ?? {
        conceptualLevel: draft.conceptualLevel,
        proceduralLevel: draft.proceduralLevel,
        description: draft.description,
      },
    };
  });

  // 2. Gather synthesis input — pure reads on this tx (D-S2R-3: synthesis ALWAYS
  //    runs at finalize, so this is on the accept-all fast path too, by design).
  const synthInput = await gatherSynthesisInput(tx, {
    studentId: session.studentId,
    subTopicIds: session.subTopicIds,
    certified: resolved.map((r) => ({ subTopicId: r.subTopicId, ...r.final })),
    // S2R-4: the sitting's chat rides into synthesis. A tutor turn can carry
    // context nothing stored has ("he was ill that week"); silently ignoring it
    // at the one moment it matters would make the chat decorative.
    chatMessages: session.messages,
  });

  // 3. The ONE synthesis call — no DB inside it, and no writes done yet.
  //    ⚠️ It is INSIDE the atomic finalize on purpose. If it throws, the whole
  //    sitting rolls back and the tutor re-clicks: the sitting stays open with its
  //    drafts intact, so a vendor flake costs a click, never a re-bill of the N 2a
  //    calls and never a half-committed sitting. That is a materially smaller
  //    tradeoff than `open`'s (where a failure discards N real calls), which is
  //    why this does NOT need allSettled — there is exactly one call to settle.
  const synthResult = await runSynthesisCall(synthInput);

  // 4. Commit the certifications. One throw here rolls back everything above.
  const committed: SessionFinalizeResult["committed"] = [];
  for (const r of resolved) {
    const res = await finalizeStage2(tx, {
      boardId: args.boardId,
      tutorUserId: args.tutorUserId,
      studentId: session.studentId,
      subTopicId: r.subTopicId,
      final: r.final,
      draft: r.draft,
    });
    committed.push({
      subTopicId: r.subTopicId,
      conceptualLevel: res.conceptualLevel,
      proceduralLevel: res.proceduralLevel,
      taught: res.taught,
      overridden: res.overridden,
    });
  }

  // 5. ...and the above-sub-topic stores, in the same tx.
  const synthesis = await writeSynthesis(tx, {
    boardId: args.boardId,
    studentId: session.studentId,
    sessionId: args.sessionId,
    scope: synthInput.scope,
    result: synthResult,
  });

  await tx
    .update(assessmentSession)
    .set({
      status: "finalized",
      finalizedAt: new Date(),
      // Persist synthesis's reasoning on the sitting — spec §6: the tutor can read
      // why, after the fact. `drafts` holds 2a's reasoning; this is 2b's.
      synthesis: { ...synthResult, dropped: synthesis.dropped },
    })
    .where(eq(assessmentSession.id, args.sessionId));

  return { sessionId: args.sessionId, committed, synthesis };
}
