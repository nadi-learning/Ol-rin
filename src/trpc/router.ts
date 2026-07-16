import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  adminProcedure,
  authedProcedure,
  parentProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  tutorProcedure,
} from "./init";
import {
  ChapterHasDependentDataError,
  ChapterNotFoundError,
  commitTopicsMd,
  extractedTopicsMdSchema,
  extractTopicsMd,
  listChaptersForAdmin,
  TopicsMdInvalidError,
} from "../services/admin_ingest";
import { NotWhitelistedError, resolveMembership } from "../services/membership";
import {
  checkAnswer,
  getChapterNav,
  getLandingState,
  getQuestions,
  getSlide,
  listSubTopics,
  QuestionNotFoundError,
  recordVisit,
  SlideNotFoundError,
} from "../services/revision";
import {
  getSession,
  NoCompletedSessionError,
  NoQuestionsError,
  PracticeSessionNotFoundError,
  QuestionMismatchError,
  reviewSession,
  SessionCompletedError,
  skip,
  startSession,
  submitAttempt,
  submitPhotoAttempt,
} from "../services/practice";
import {
  AttemptFeedbackNotFoundError,
  getAnswerFeedback,
  NotEvaluableError,
} from "../services/answer_feedback";
import {
  AiBadJsonError,
  AiEmptyResponseError,
  AiNotConfiguredError,
} from "../services/ai/gemini";
import {
  getUploadStatus as getUploadSlotStatus,
  mintUploadToken,
  UploadNotReadyError,
  UploadSlotInvalidError,
} from "../services/upload";
import { env } from "../config/env";
import {
  getObservations,
  getProgressTree,
  getStudentMastery,
  getStudentPacePlan,
  getSubTopicQuestions,
  listPendingStage2,
  FlagNotFoundError,
  getCrossConceptFlags,
  listStudents,
  ObservationNotFoundError,
  overrideObservation,
  setCrossConceptFlagAddressed,
  StudentNotFoundError,
} from "../services/tutor";
import {
  endVoiceSession,
  startVoiceSession,
  VoiceContextMissingError,
  voiceModeSchema,
  VoiceSessionNotFoundError,
  voiceTurnSchema,
} from "../services/voice";
import {
  PipecatStartError,
  pipecatVoiceModeSchema,
  startPipecatVoiceSession,
  VoicePipecatNotConfiguredError,
} from "../services/voice_pipecat";
import { getStudentSummary } from "../services/dashboard";
import { getMyInsights } from "../services/insights";
import {
  getPlan,
  listSubjects,
  PaceSubjectNotFoundError,
  PaceValidationError,
  setupPlan,
  updatePlan,
} from "../services/pace";
import {
  draftStage2,
  finalizeStage2,
  NoObservationsError,
  stage2DraftSchema,
  SubTopicNotFoundError,
} from "../services/assessment";
import { getDueQueue } from "../services/scheduler";
import {
  AssignmentNotFoundError,
  assignApprovedQuestions,
  createAssignment,
  InvalidAssignmentError,
  listAssignmentsForStudent,
  listAssignmentsForTutor,
} from "../services/assignment";
import {
  ChildNotFoundError,
  getChildReport,
  listChildren,
} from "../services/parent";
import {
  assembleReport,
  getReportForParent,
  getReportForTutor,
  listReportsForParent,
  listReportsForTutor,
  publishReport,
  ReportAlreadyPublishedError,
  ReportNotFoundError,
} from "../services/report";
import {
  approveDrafts,
  assertOwnedDraft,
  discardDraft,
  draftItemSchema,
  draftQuestions,
  DraftNotFoundError,
  finalItemSchema,
  listAuthoredQuestions,
  listDrafts,
  saveItemSchema,
  saveQuestions,
  updateDraft,
} from "../services/authoring";
import {
  AuthoringChatNotFoundError,
  authorFromChat,
  authorSetFromChat,
  ChapterNotInBoardError,
  getChat,
  listAuthoringChats,
  proposeTarget,
  proposeTargetSet,
  ProposeTargetError,
  reviseDraft,
  sendTurn,
  startChat,
} from "../services/authoring_chat";
import { enqueueImageGeneration, getImageJobState } from "../worker/queue";
import { verifyImage, VerifyImageNotFoundError } from "../services/image_verify";
import { currentImageFor } from "../services/image_read";
import { VendorChoice } from "@b2c/kernel/contracts";

export const appRouter = router({
  // S0 contract: health → { ok: true }.
  health: publicProcedure.query(() => ({ ok: true as const })),

  // S1 contract: me → { user, board, role }. Resolves the Better Auth identity
  // into the spine (app_user by email) + checks the board whitelist, creating
  // the membership on first entry. Runs inside the board-scoped tx (authed).
  me: authedProcedure.query(async ({ ctx }) => {
    try {
      return await resolveMembership(ctx.tx, {
        email: ctx.realUser.email,
        name: ctx.realUser.name,
        board: ctx.board,
      });
    } catch (e) {
      if (e instanceof NotWhitelistedError) {
        throw new TRPCError({ code: "FORBIDDEN", message: e.code });
      }
      throw e;
    }
  }),

  // S3 contract: revision.getSlide({ subTopicId }) → { versionNo, slideId,
  // bundleUrl }. The bridge read — current published slide for a sub_topic,
  // always-latest (D-WS3). protectedProcedure → authed + board + membership +
  // RLS-scoped tx; a sub_topic on another board is invisible → NOT_FOUND.
  revision: router({
    // Nav source — sub_topics visible under the board (S4). RLS-scoped.
    // (Superseded by getChapterNav for the page; kept for compatibility.)
    listSubTopics: protectedProcedure.query(({ ctx }) => listSubTopics(ctx.tx)),

    // Feature B: chapter → section → slide tree for the prod-style nav (sidebar
    // + top-bar prev/next). RLS-scoped, ordinal-ordered. The FE derives the flat
    // prev/next slide order from this tree.
    getChapterNav: protectedProcedure.query(({ ctx }) => getChapterNav(ctx.tx)),

    getSlide: protectedProcedure
      .input(z.object({ subTopicId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          const slide = await getSlide(ctx.tx, { subTopicId: input.subTopicId });
          // Bake the board into the bundle URL: the FE renders by dynamic-
          // import()ing this URL, and that transport can't send the x-board
          // header (D-S4-1), so the bundle route reads board from the query
          // param. Sourced from ctx.board here, not the client, so it's honest.
          return {
            ...slide,
            bundleUrl: `${slide.bundleUrl}?board=${ctx.board.slug}`,
          };
        } catch (e) {
          if (e instanceof SlideNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice A: revision.getQuestions({ subTopicId }) → { slideId, questions }.
    // One RANDOM question per slot (param locked), public/key-free shape — the
    // answer key (evaluation) is stripped server-side and never serialized.
    getQuestions: protectedProcedure
      .input(z.object({ subTopicId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getQuestions(ctx.tx, { subTopicId: input.subTopicId });
        } catch (e) {
          if (e instanceof SlideNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice A: revision.checkAnswer({ subTopicId, questionId, answer, timeMs? }) →
    // verdict. A mutation (matches prod's POST /revision/check semantics) — grades
    // the answer against the server-side key and reveals correctAnswer/explanation
    // only in the response. Records each check to event_log (D-A-1 closure /
    // D-MCQ-1, record-only — no LLM/observation/mastery, G4). board+user from ctx.
    checkAnswer: protectedProcedure
      .input(
        z.object({
          subTopicId: z.string().uuid(),
          questionId: z.string().min(1),
          answer: z.string(),
          timeMs: z.number().int().nonnegative().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await checkAnswer(ctx.tx, {
            ...input,
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
          });
        } catch (e) {
          if (
            e instanceof SlideNotFoundError ||
            e instanceof QuestionNotFoundError
          ) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice REV-LAND: the landing aggregate — one read powering the templated
    // greeting + chips (first-time flag, resume, self due-top with levels
    // STRIPPED per D-REV-2/D-INS-1, pace-plan chapter, strongest chapter).
    // Self-scoped by ctx.membership.userId inside the board tx (D-L-5).
    getLandingState: protectedProcedure.query(({ ctx }) =>
      getLandingState(ctx.tx, {
        self: {
          studentId: ctx.membership.userId,
          name: ctx.realUser.name,
          email: ctx.realUser.email,
        },
      }),
    ),

    // Slice REV-LAND: record a slide visit (D-REV-1 durable resume). Fired
    // fire-and-forget by the FE when a slide resolves; NOT_FOUND on a
    // cross-board/unknown sub_topic (visibility checked under RLS — FK checks
    // alone would bypass it).
    recordVisit: protectedProcedure
      .input(z.object({ subTopicId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await recordVisit(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            subTopicId: input.subTopicId,
          });
          return { ok: true as const };
        } catch (e) {
          if (e instanceof SlideNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),
  }),

  // Slice L: Practice capture (leaf pass). Self-serve subjective practice on a
  // sub_topic; every attempt persists. NO AI, NO mastery, NO tutor. The answer
  // key (reference_answer/explanation) is server-side — projected out on read,
  // revealed only in the submit/skip response (D-L-3). protectedProcedure →
  // authed + board + membership + RLS; each handler also asserts the session is
  // the caller's (RLS scopes board, not user). appUserId = ctx.membership.userId.
  practice: router({
    // Slice ASG: the student's assigned work (origin='tutor_assigned'). Each
    // assignment lists its sub_topics with per-sub_topic start/complete status;
    // the FE opens each via startSession({ subTopicId, assignmentId }).
    listAssignments: protectedProcedure.query(({ ctx }) =>
      listAssignmentsForStudent(ctx.tx, { appUserId: ctx.membership.userId }),
    ),

    startSession: protectedProcedure
      .input(
        z.object({
          subTopicId: z.string().uuid(),
          // Slice ASG: when present, starts a tutor-assigned session (must be the
          // caller's assignment + contain the sub_topic). Omitted = self-serve.
          assignmentId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await startSession(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            subTopicId: input.subTopicId,
            assignmentId: input.assignmentId ?? null,
          });
        } catch (e) {
          if (e instanceof NoQuestionsError || e instanceof AssignmentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof InvalidAssignmentError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    getSession: protectedProcedure
      .input(z.object({ sessionId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getSession(ctx.tx, {
            sessionId: input.sessionId,
            appUserId: ctx.membership.userId,
          });
        } catch (e) {
          if (e instanceof PracticeSessionNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Read-only review of a COMPLETED sub_topic (the "✓ done" tile). Returns the
    // student's answers + the model answers, no answer box, and never spawns a
    // fresh session. self-serve (no assignmentId) and assigned copies stay
    // distinct, matching startSession's resume semantics.
    reviewSession: protectedProcedure
      .input(
        z.object({
          subTopicId: z.string().uuid(),
          assignmentId: z.string().uuid().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        try {
          return await reviewSession(ctx.tx, {
            appUserId: ctx.membership.userId,
            subTopicId: input.subTopicId,
            assignmentId: input.assignmentId ?? null,
          });
        } catch (e) {
          if (e instanceof NoCompletedSessionError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    submitAttempt: protectedProcedure
      .input(
        z.object({
          sessionId: z.string().uuid(),
          questionId: z.string().uuid(),
          answerText: z.string().min(1),
          confidence: z.number().int().min(1).max(5),
          timeMs: z.number().int().min(0),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await submitAttempt(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            ...input,
          });
        } catch (e) {
          if (e instanceof PracticeSessionNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (
            e instanceof SessionCompletedError ||
            e instanceof QuestionMismatchError
          ) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    skip: protectedProcedure
      .input(
        z.object({
          sessionId: z.string().uuid(),
          questionId: z.string().uuid(),
          reason: z.string().nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await skip(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            sessionId: input.sessionId,
            questionId: input.questionId,
            reason: input.reason ?? null,
          });
        } catch (e) {
          if (e instanceof PracticeSessionNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (
            e instanceof SessionCompletedError ||
            e instanceof QuestionMismatchError
          ) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // ── Cross-Device Upload (Slice Q3 — answer-photo capture) ──────────────
    // The student answered on paper: mint a token → show its QR → the phone
    // uploads photos to the unauth /upload/:token route → poll → submit.

    // Mint (or reuse) an upload token for the current answer slot; returns the
    // absolute URL the desktop QR encodes ({base}/upload/{token}).
    createUploadToken: protectedProcedure
      .input(
        z.object({
          sessionId: z.string().uuid(),
          questionId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const { token, expiresAt } = await mintUploadToken(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            sessionId: input.sessionId,
            questionId: input.questionId,
          });
          const base = env.PUBLIC_UPLOAD_BASE_URL ?? env.FRONTEND_URL;
          // Option B (Q3-3): the QR points at the FE PAGE path `/u/:token` (the
          // React capture page), NOT the backend JSON API which stays at
          // `/upload/:token`. Distinct paths so page-navigation and the JSON
          // API never collide on a shared prod origin behind nginx.
          return {
            token,
            uploadUrl: `${base}/u/${token}`,
            expiresAt,
          };
        } catch (e) {
          if (e instanceof UploadSlotInvalidError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // Desktop's 3s poll: has the phone uploaded yet?
    getUploadStatus: protectedProcedure
      .input(
        z.object({
          sessionId: z.string().uuid(),
          questionId: z.string().uuid(),
          // The exact token in the desktop's QR. When present, the poll reports
          // that token's status rather than "newest for the slot" — so a stray
          // sibling token can't strand the poll on "Waiting…".
          token: z.string().min(1).optional(),
        }),
      )
      .query(({ ctx, input }) =>
        getUploadSlotStatus(ctx.tx, {
          sessionId: input.sessionId,
          questionId: input.questionId,
          appUserId: ctx.membership.userId,
          token: input.token,
        }),
      ),

    // Consume the uploaded token into a photo attempt (the answer IS the photos;
    // confidence + timing still ride along from the desktop).
    submitPhotoAttempt: protectedProcedure
      .input(
        z.object({
          sessionId: z.string().uuid(),
          questionId: z.string().uuid(),
          uploadToken: z.string().min(1),
          confidence: z.number().int().min(1).max(5),
          timeMs: z.number().int().min(0),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await submitPhotoAttempt(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            ...input,
          });
        } catch (e) {
          if (e instanceof PracticeSessionNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (
            e instanceof SessionCompletedError ||
            e instanceof QuestionMismatchError ||
            e instanceof UploadNotReadyError
          ) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // ── Immediate answer feedback (Slice T1) ──────────────────────────────
    // On demand after a typed submit: compute (or return the cached) student-
    // facing eval of THIS answer: prose + a marks score (Fork B reversed
    // 2026-07-15); never moves mastery (D1 v0). A mutation because it does an AI call + caches on
    // first hit. An AI failure maps to a soft error the FE swallows — the reveal
    // + model answer are already shown, so feedback is strictly additive.
    getAnswerFeedback: protectedProcedure
      .input(z.object({ attemptId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await getAnswerFeedback(ctx.tx, {
            appUserId: ctx.membership.userId,
            attemptId: input.attemptId,
          });
        } catch (e) {
          if (e instanceof AttemptFeedbackNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof NotEvaluableError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          if (
            e instanceof AiNotConfiguredError ||
            e instanceof AiEmptyResponseError ||
            e instanceof AiBadJsonError
          ) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "AI_FEEDBACK_FAILED",
            });
          }
          throw e;
        }
      }),
  }),

  // Slice VOICE-1: spoken AI tutoring on a revision slide. Backend spine only —
  // no audio transport yet (VOICE-2 = Gemini Live relay). startSession resolves
  // the slide's voice_context grounding + returns the system prompt the relay
  // opens with; endSession persists the transcript + a post-call analysis (NO
  // mastery move). protectedProcedure → authed + board + membership + RLS; each
  // handler also asserts the session is the caller's (D-L-5). appUserId =
  // ctx.membership.userId.
  voice: router({
    startSession: protectedProcedure
      .input(
        z.object({
          subTopicId: z.string().uuid(),
          mode: voiceModeSchema.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await startVoiceSession(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            subTopicId: input.subTopicId,
            mode: input.mode,
          });
        } catch (e) {
          if (e instanceof SlideNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof VoiceContextMissingError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // Slice VOICE-A0 (D2 → Option A): start a Pipecat-backed voice session.
    // The rewrite orchestrates; the proven `nadi-tutor` bot runs the pipeline.
    // Returns the Daily room + token the FE joins (transport swap is A2). Distinct
    // from startSession above (the Gemini-Live path) so the VOICE_BACKEND cutover
    // can't regress it — same protectedProcedure gates (authed + board + RLS).
    startPipecatSession: protectedProcedure
      .input(
        z.object({
          subTopicId: z.string().uuid(),
          mode: pipecatVoiceModeSchema.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await startPipecatVoiceSession(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            subTopicId: input.subTopicId,
            mode: input.mode,
          });
        } catch (e) {
          if (e instanceof SlideNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof VoiceContextMissingError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          if (e instanceof VoicePipecatNotConfiguredError) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.code });
          }
          if (e instanceof PipecatStartError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.code });
          }
          throw e;
        }
      }),

    endSession: protectedProcedure
      .input(
        z.object({
          sessionId: z.string().uuid(),
          transcript: z.array(voiceTurnSchema),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await endVoiceSession(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            sessionId: input.sessionId,
            transcript: input.transcript,
          });
        } catch (e) {
          if (e instanceof VoiceSessionNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),
  }),

  // Slice DASH: the student home/dashboard summary — three headline stat cards
  // (completed / in-progress sessions + total practice time) over the CALLER'S
  // OWN practice history. Read-only, user-scoped by app_user_id inside the
  // board-scoped tx (D-L-5: RLS scopes board, not user). The lesson LIST is
  // served by revision.getChapterNav; this is only the numbers.
  dashboard: router({
    getStudentSummary: protectedProcedure.query(({ ctx }) =>
      getStudentSummary(ctx.tx, { appUserId: ctx.membership.userId }),
    ),
  }),

  // Slice INS: the student's OWN insights/progress surface. Reuses
  // computeChildReport for the caller-as-self, then projects certified levels to
  // SOFT BUCKETS (raw 1–5 dropped server-side — D-INS-1) + effort metrics. NO AI,
  // NO mastery move, NO writes. protectedProcedure → self-scoped by
  // ctx.membership.userId inside the board-scoped tx (D-L-5).
  insights: router({
    getMySummary: protectedProcedure.query(({ ctx }) =>
      getMyInsights(ctx.tx, {
        studentId: ctx.membership.userId,
        name: ctx.realUser.name,
        email: ctx.realUser.email,
      }),
    ),
  }),

  // Slice PACE-1: the student Pace Plan (#7). Per-student, per-subject timeline —
  // setup + projected chapter date ranges + pace status. Stores INPUTS ONLY
  // (D-PACE-5); everything derived is recomputed on read. NO AI, NO mastery move.
  // protectedProcedure → self-scoped by ctx.membership.userId inside the
  // board-scoped tx (D-L-5). NOT_FOUND on a cross-board/unknown subject;
  // BAD_REQUEST on validation (missing/invalid dates, bad chapter order).
  pace: router({
    listSubjects: protectedProcedure.query(({ ctx }) => listSubjects(ctx.tx)),

    getPlan: protectedProcedure
      .input(z.object({ subjectId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getPlan(ctx.tx, {
            // self ChildSummary drives the plan lookup AND the PACE-2 preparedness
            // roll-up (computeChildReport reads the caller's certified mastery).
            self: {
              studentId: ctx.membership.userId,
              name: ctx.realUser.name,
              email: ctx.realUser.email,
            },
            subjectId: input.subjectId,
          });
        } catch (e) {
          if (e instanceof PaceSubjectNotFoundError)
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          throw e;
        }
      }),

    setupPlan: protectedProcedure
      .input(
        z.object({
          subjectId: z.string().uuid(),
          startDate: z.string().optional(),
          endDate: z.string(),
          chapterOrder: z.array(z.string().uuid()).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          await setupPlan(ctx.tx, {
            boardId: ctx.board.id,
            appUserId: ctx.membership.userId,
            subjectId: input.subjectId,
            startDate: input.startDate,
            endDate: input.endDate,
            chapterOrder: input.chapterOrder,
          });
          return { ok: true as const };
        } catch (e) {
          if (e instanceof PaceSubjectNotFoundError)
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          if (e instanceof PaceValidationError)
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          throw e;
        }
      }),

    updatePlan: protectedProcedure
      .input(
        z.object({
          subjectId: z.string().uuid(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          chapters: z
            .array(
              z.object({
                chapterId: z.string().uuid(),
                completed: z.boolean(),
                // PACE-1.1: optional per-chapter student estimate override (D-PACE-10).
                weeksOverride: z.number().min(0.5).max(52).optional(),
              }),
            )
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          await updatePlan(ctx.tx, {
            appUserId: ctx.membership.userId,
            subjectId: input.subjectId,
            startDate: input.startDate,
            endDate: input.endDate,
            chapters: input.chapters,
          });
          return { ok: true as const };
        } catch (e) {
          if (e instanceof PaceValidationError)
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          throw e;
        }
      }),
  }),

  // Slice T: Tutor read surface. A tutor inspects a LINKED student's certified
  // mastery + the Stage-1 observations waiting to be certified. NO mastery move,
  // NO AI (Slice S2 adds the draft + finalize). tutorProcedure → authed + board
  // + membership + role='tutor' (M11 CHECK side). Every per-student read also
  // asserts a tutor_student link → foreign student = NOT_FOUND (no existence
  // leak; RLS scopes by board, not user).
  tutor: router({
    listStudents: tutorProcedure.query(({ ctx }) =>
      listStudents(ctx.tx, ctx.membership.userId),
    ),

    getStudentMastery: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getStudentMastery(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice QA3-c: the progress-first two-axis tree (chapter → topic →
    // sub_topic; weakest-link + spread). The authoring entry surface (D-QA3-1/2).
    getProgressTree: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getProgressTree(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    listPendingStage2: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await listPendingStage2(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    getObservations: tutorProcedure
      .input(
        z.object({
          studentId: z.string().uuid(),
          subTopicId: z.string().uuid(),
        }),
      )
      .query(async ({ ctx, input }) => {
        try {
          return await getObservations(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
            subTopicId: input.subTopicId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Assign-tab question preview: the approved canonical questions for a
    // sub_topic + each one's authoring "why" (pedagogical_note). Tutor-facing;
    // board content, so no per-student scope.
    getSubTopicQuestions: tutorProcedure
      .input(z.object({ subTopicId: z.string().uuid() }))
      .query(({ ctx, input }) =>
        getSubTopicQuestions(ctx.tx, { subTopicId: input.subTopicId }),
      ),

    // ASSESS-FIX-2: correct a Stage-1 observation (assessment.md §6 — "adjust an
    // observation level … with a reason"). Observations are the durable evidence
    // every future Stage-2 recounts from, so a misread the tutor can see but not
    // correct would keep corrupting counts. LAYERED: the machine's read is kept,
    // `tutorLevel` carries the correction, and an `observation_override` event is
    // logged separately (frame 4). level=null clears the override.
    overrideObservation: tutorProcedure
      .input(
        z.object({
          observationId: z.string().uuid(),
          level: z.number().int().min(1).max(5).nullable(),
          reason: z.string().min(1).max(2000).nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await overrideObservation(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            observationId: input.observationId,
            level: input.level,
            reason: input.reason,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError || e instanceof ObservationNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // ASSESS-FIX-4: the student's OPEN cross-concept flags — "ran the trig fine
    // but couldn't rationalise the denominator". These carry NO rung and count
    // toward NO level (§2 procedural Step 4 forbids denting the assessed sub-topic);
    // they are a worklist of weak prerequisites surfacing in other work.
    getCrossConceptFlags: tutorProcedure
      .input(
        z.object({
          studentId: z.string().uuid(),
          includeAddressed: z.boolean().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        try {
          return await getCrossConceptFlags(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
            includeAddressed: input.includeAddressed,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    setCrossConceptFlagAddressed: tutorProcedure
      .input(z.object({ flagId: z.string().uuid(), addressed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await setCrossConceptFlagAddressed(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            flagId: input.flagId,
            addressed: input.addressed,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError || e instanceof FlagNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice T6: the tutor Pace-Plan view (read-only). listSubjects for the
    // subject picker; getStudentPacePlan → a linked student's derive-at-read
    // Pace Plan (the SAME view the student sees). NO writes. Ownership-guarded
    // (foreign student → NOT_FOUND); unknown/cross-board subject → NOT_FOUND.
    listSubjects: tutorProcedure.query(({ ctx }) => listSubjects(ctx.tx)),

    getStudentPacePlan: tutorProcedure
      .input(z.object({ studentId: z.string().uuid(), subjectId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getStudentPacePlan(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
            subjectId: input.subjectId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError || e instanceof PaceSubjectNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice SCH: getDueQueue({ studentId }) → the spiral due-queue (#3). PURE
    // CODE, no AI, no mastery move — reads scheduling_state + mastery_state and
    // composes the day's due/overdue taught sub-topics, grouped by subject with
    // the interleaved/blocked suggestion. Ownership-guarded like the rest.
    getDueQueue: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getDueQueue(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice ASG: createAssignment — the compose→assign action (D-SCH-2's deferred
    // half). One flow, two configs (intent §5): 'blocked' = tutor picks within a
    // chapter; 'interleaved' = system pre-fills from the due-queue, tutor edits.
    // Persists the frozen sub_topic composition; the student then executes it via
    // the practice stepper (origin='tutor_assigned'). tutorProcedure + ownership
    // guard. Validation errors → BAD_REQUEST; foreign student → NOT_FOUND.
    createAssignment: tutorProcedure
      .input(
        z.object({
          studentId: z.string().uuid(),
          mode: z.enum(["blocked", "interleaved"]),
          subTopicIds: z.array(z.string().uuid()).min(1),
          subjectId: z.string().uuid().optional(),
          chapterId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createAssignment(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
            mode: input.mode,
            subTopicIds: input.subTopicIds,
            subjectId: input.subjectId ?? null,
            chapterId: input.chapterId ?? null,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof InvalidAssignmentError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // Slice ASG: listAssignments({ studentId }) — the tutor's read-back of what
    // they've assigned this student, with per-assignment progress (completedCount
    // / total derived from the linked practice_sessions, D-ASG-3).
    listAssignments: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await listAssignmentsForTutor(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice S2: getStage2Draft({ studentId, subTopicId }) → the AI proposal.
    // A MUTATION (it's a one AI call, not idempotent/cacheable) — reads ALL the
    // sub-topic's Stage-1 observations + current mastery, applies §3 in the LLM,
    // proposes the new pair + description + log + the two re-check dates. Reads
    // only — re-runnable. tutorProcedure + ownership guard. Runs INLINE (the
    // tutor waits), unlike Stage-1's background worker (D-S2-6).
    getStage2Draft: tutorProcedure
      .input(
        z.object({
          studentId: z.string().uuid(),
          subTopicId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await draftStage2(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
            subTopicId: input.subTopicId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError || e instanceof SubTopicNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof NoObservationsError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // Slice S2: finalizeStage2 — the FIRST mastery move. Commits the tutor-
    // adjusted proposal (final pair + description; the draft round-trips for the
    // AI-authored log/dates and override diffing). One tx: snapshot→history,
    // overwrite mastery_state, append transcript+events, write scheduling_state,
    // emit `taught` (G2) at ≥L2. tutorProcedure + ownership guard.
    finalizeStage2: tutorProcedure
      .input(
        z.object({
          studentId: z.string().uuid(),
          subTopicId: z.string().uuid(),
          final: z.object({
            // null = not yet observed on that axis (never a 1) — the tutor can
            // leave an axis unobserved when no item exposed it.
            conceptualLevel: z.number().int().min(1).max(5).nullable(),
            proceduralLevel: z.number().int().min(1).max(5).nullable(),
            description: z.string().min(1),
          }),
          draft: stage2DraftSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await finalizeStage2(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
            subTopicId: input.subTopicId,
            final: input.final,
            draft: input.draft,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError || e instanceof SubTopicNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice Report-Signoff (D-P-1 deferred half): the tutor SIGN-OFF side.
    // assembleReport freezes the child's progress into a draft snapshot;
    // publishReport signs it off → visible to the parent. Ownership-gated
    // (assertTutorsStudent); author-only publish. NO AI.
    assembleReport: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await assembleReport(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    publishReport: tutorProcedure
      .input(
        z.object({
          reportId: z.string().uuid(),
          tutorNote: z.string().max(4000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await publishReport(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            reportId: input.reportId,
            tutorNote: input.tutorNote ?? null,
          });
        } catch (e) {
          if (e instanceof ReportNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof ReportAlreadyPublishedError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    listReports: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await listReportsForTutor(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    getReport: tutorProcedure
      .input(z.object({ reportId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getReportForTutor(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            reportId: input.reportId,
          });
        } catch (e) {
          if (e instanceof ReportNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice AUTH (#1 Question authoring): draftQuestions → one INLINE Gemini call
    // drafts N subjective questions for a sub_topic to its LOs (D-AUTH-2/3/4).
    // A MUTATION (one AI call, not idempotent) — reads-only, re-runnable.
    // tutorProcedure role-gate only; authoring is BOARD content, no per-student
    // ownership guard.
    draftQuestions: tutorProcedure
      .input(
        z.object({
          subTopicId: z.string().uuid(),
          count: z.number().int().min(1).max(8),
          axisFocus: z.enum(["conceptual", "procedural", "both"]).optional(),
          intent: z.string().max(2000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await draftQuestions(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            subTopicId: input.subTopicId,
            count: input.count,
            axisFocus: input.axisFocus ?? null,
            intent: input.intent ?? null,
          });
        } catch (e) {
          if (e instanceof SubTopicNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice AUTH: saveQuestions — insert the approved (tutor-edited) set as live
    // question rows (consecutive ordinals after max, D-AUTH-3) + log an
    // `authoring_edit` per edited draft (D-AUTH-6). No mastery move.
    saveQuestions: tutorProcedure
      .input(
        z.object({
          subTopicId: z.string().uuid(),
          items: z.array(saveItemSchema).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await saveQuestions(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            subTopicId: input.subTopicId,
            items: input.items,
          });
        } catch (e) {
          if (e instanceof SubTopicNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice AUTH-v2.1 item #2: listAuthoredQuestions({ studentId }) — the tutor's
    // review read of every question authored PRIVATE to that student. Tutor
    // surface → reference answer + intent ARE returned (the M11 answer-key gate
    // is for student-facing reads). Ownership-guarded → foreign student=NOT_FOUND.
    listAuthoredQuestions: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await listAuthoredQuestions(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // ── Slice AUTH-v2: student-grounded conversational authoring ──
    // Tutor picks a STUDENT → chat grounded in their mastery/observations →
    // author questions PRIVATE to the student (target_student_id). Vendor
    // (claude_cli | gemini_api) is tutor-picked per chat. All tutorProcedure +
    // the chat's tutor-ownership guard → a chat you don't own = NOT_FOUND.

    // Start a chat for one of your students with a chosen vendor.
    startAuthoringChat: tutorProcedure
      .input(
        z.object({
          studentId: z.string().uuid(),
          vendor: VendorChoice,
          // Slice AUTH-v2.1: the chapter chosen upfront (scopes proposeTarget's
          // sub_topic allowlist). Optional for back-compat; the fast path sends it.
          chapterId: z.string().uuid().optional(),
          // Slice QA3-d: the mode + multi-chapter scope. blocked = 1 chapter,
          // interleaved = N chapters (grounded across the set). Defaults to blocked.
          mode: z.enum(["blocked", "interleaved"]).optional(),
          chapterIds: z.array(z.string().uuid()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await startChat(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
            vendor: input.vendor,
            mode: input.mode,
            chapterId: input.chapterId ?? null,
            chapterIds: input.chapterIds,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof ChapterNotInBoardError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // Read a chat's transcript (ownership-gated).
    getAuthoringChat: tutorProcedure
      .input(z.object({ chatId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getChat(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            chatId: input.chatId,
          });
        } catch (e) {
          if (e instanceof AuthoringChatNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Eyeball-#2 item #3: the student's authoring chats, newest-first — the
    // history behind the "Past chats" picker. Ownership-guarded.
    listAuthoringChats: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await listAuthoringChats(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // One conversational turn (the ported chat loop: resume-or-stitch + vendor
    // lock). A MUTATION (one AI call, persists the turn). streamKey is Stage-2
    // (SSE); omitted here, request-response.
    sendAuthoringChatTurn: tutorProcedure
      .input(
        z.object({
          chatId: z.string().uuid(),
          text: z.string().min(1).max(8000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await sendTurn(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            chatId: input.chatId,
            text: input.text,
          });
        } catch (e) {
          if (e instanceof AuthoringChatNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Consent-in-chat target resolution (Slice AUTH-v2.1, replaces the picker):
    // the AI picks ONE sub_topic BY NUMBER from the chat's chapter allowlist +
    // a count, from the conversation. The tutor confirms, then authorFromChat runs.
    proposeAuthoringTarget: tutorProcedure
      .input(z.object({ chatId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await proposeTarget(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            chatId: input.chatId,
          });
        } catch (e) {
          if (e instanceof AuthoringChatNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof ProposeTargetError) {
            // no chapter / no sub-topics → the FE prompts "pick a chapter first".
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.code });
          }
          throw e;
        }
      }),

    // QA3-e-2: propose an INTERLEAVED SET of sub_topics + per-sub_topic counts from
    // the conversation (the master-side selection for the parallel fan-out). The
    // tutor confirms, then authorSetFromChat fans out. Interleaved is an FE policy;
    // the service is general (works for any chat with sub-topics in scope).
    proposeAuthoringSet: tutorProcedure
      .input(z.object({ chatId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await proposeTargetSet(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            chatId: input.chatId,
          });
        } catch (e) {
          if (e instanceof AuthoringChatNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof ProposeTargetError) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.code });
          }
          throw e;
        }
      }),

    // QA3-e-2: author the confirmed SET — fan out one scoped worker per sub_topic
    // in PARALLEL (each in its own board tx), collect into a multi-target review.
    // Fault-isolated: returns { groups, failures } — a partial failure never sinks
    // the batch. Max 5 targets (fan-out concurrency stays under the pool).
    authorSetFromChat: tutorProcedure
      .input(
        z.object({
          chatId: z.string().uuid(),
          targets: z
            .array(
              z.object({
                subTopicId: z.string().uuid(),
                count: z.number().int().min(1).max(8),
              }),
            )
            .min(1)
            .max(5),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await authorSetFromChat(ctx.tx, {
            boardId: ctx.board.id,
            tutorUserId: ctx.membership.userId,
            chatId: input.chatId,
            targets: input.targets,
          });
        } catch (e) {
          if (
            e instanceof AuthoringChatNotFoundError ||
            e instanceof SubTopicNotFoundError
          ) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Revise ONE drafted question per a tutor instruction (the per-question
    // mini-chat). Pre-save; returns the revised draft (the tutor still edits/saves).
    reviseDraftQuestion: tutorProcedure
      .input(
        z.object({
          chatId: z.string().uuid(),
          questionId: z.string().uuid(), // FIG-AUTH: the persisted draft to revise
          refinementNote: z.string().min(1).max(2000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await reviseDraft(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            chatId: input.chatId,
            questionId: input.questionId,
            refinementNote: input.refinementNote,
          });
        } catch (e) {
          if (
            e instanceof AuthoringChatNotFoundError ||
            e instanceof DraftNotFoundError ||
            e instanceof StudentNotFoundError
          ) {
            throw new TRPCError({ code: "NOT_FOUND", message: (e as { code: string }).code });
          }
          throw e;
        }
      }),

    // The separate structured authoring call (fork 4): conversation → questions
    // to the student's weakness. Reads-only/re-runnable; vendor honored.
    authorFromChat: tutorProcedure
      .input(
        z.object({
          chatId: z.string().uuid(),
          subTopicId: z.string().uuid(),
          count: z.number().int().min(1).max(8),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await authorFromChat(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            chatId: input.chatId,
            subTopicId: input.subTopicId,
            count: input.count,
          });
        } catch (e) {
          if (
            e instanceof AuthoringChatNotFoundError ||
            e instanceof SubTopicNotFoundError
          ) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // ── Slice FIG-AUTH: the DRAFT lifecycle (D-FIG-1/2/5) ──
    // Chat authoring PERSISTS drafts (authorFromChat / the tool) as status='draft'
    // rows; the tutor edits + renders figures against them, then APPROVES.

    // The student's current draft set — for the review form + rehydrate-on-load.
    listDrafts: tutorProcedure
      .input(z.object({ studentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await listDrafts(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            studentId: input.studentId,
          });
        } catch (e) {
          if (e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Edit one draft's fields + figure spec (autosave from the form).
    updateDraft: tutorProcedure
      .input(z.object({ questionId: z.string().uuid(), patch: finalItemSchema }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await updateDraft(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            questionId: input.questionId,
            patch: input.patch,
          });
        } catch (e) {
          if (e instanceof DraftNotFoundError || e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: (e as { code: string }).code });
          }
          throw e;
        }
      }),

    // Approve drafts → live to the student (the M11 ENABLEMENT side).
    approveDrafts: tutorProcedure
      .input(
        z.object({
          questionIds: z.array(z.string().uuid()).min(1),
          // ASG-AUTO: when on, also push the approved questions to the student as
          // an assignment (find-and-extend, split per scope). mode = the chat's
          // authoring mode; without it the assign is skipped.
          assign: z.boolean().optional(),
          mode: z.enum(["blocked", "interleaved"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const res = await approveDrafts(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            questionIds: input.questionIds,
          });
          const assignments =
            input.assign && input.mode
              ? await assignApprovedQuestions(ctx.tx, {
                  boardId: ctx.board.id,
                  tutorUserId: ctx.membership.userId,
                  mode: input.mode,
                  questionIds: res.approvedIds,
                })
              : [];
          return { ...res, assignments };
        } catch (e) {
          if (e instanceof DraftNotFoundError || e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: (e as { code: string }).code });
          }
          if (e instanceof InvalidAssignmentError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          }
          throw e;
        }
      }),

    // Discard a draft (+ any rendered figures).
    discardDraft: tutorProcedure
      .input(z.object({ questionId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await discardDraft(ctx.tx, {
            tutorUserId: ctx.membership.userId,
            questionId: input.questionId,
          });
        } catch (e) {
          if (e instanceof DraftNotFoundError || e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: (e as { code: string }).code });
          }
          throw e;
        }
      }),

    // Generate / regenerate a figure for a draft (on-demand, D-FIG-2). Ownership-
    // guarded, then enqueued with a UNIQUE jobId so each click renders a new
    // version (the worker: Gemini script → nadi-pyrender → PNG → vision verify).
    generateQuestionImage: tutorProcedure
      .input(
        z.object({
          questionId: z.string().uuid(),
          refinementNote: z.string().max(2000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          await assertOwnedDraft(ctx.tx, ctx.membership.userId, input.questionId);
        } catch (e) {
          if (e instanceof DraftNotFoundError || e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: (e as { code: string }).code });
          }
          throw e;
        }
        const jobId = `image-${input.questionId}-${Date.now()}`;
        await enqueueImageGeneration(
          {
            questionId: input.questionId,
            boardId: ctx.board.id,
            refinementNote: input.refinementNote ?? null,
          },
          { jobId, delayMs: 0 },
        );
        // Return the jobId so the poll can watch the job's state and surface a
        // failure fast, instead of waiting out the full render-poll cap on a job
        // that will never write an image row (e.g. the render sidecar is down).
        return { enqueued: true as const, jobId };
      }),

    // Coarse render-job state for the tutor's poll (waiting/active/completed/
    // failed/unknown). Lets the FE stop polling + show a friendly failure the
    // moment a render job fails, rather than after the ~6-min image-poll cap.
    getImageJobStatus: tutorProcedure
      .input(z.object({ jobId: z.string().max(200) }))
      .query(async ({ input }) => {
        return { state: await getImageJobState(input.jobId) };
      }),

    // Poll the current rendered figure for a draft (thumbnail + verifier badge).
    getQuestionImage: tutorProcedure
      .input(z.object({ questionId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          await assertOwnedDraft(ctx.tx, ctx.membership.userId, input.questionId);
        } catch (e) {
          if (e instanceof DraftNotFoundError || e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: (e as { code: string }).code });
          }
          throw e;
        }
        return (await currentImageFor(ctx.tx, input.questionId)) ?? null;
      }),

    // Re-run the vision verifier on a draft's current figure (inline; tutor waits).
    reverifyQuestionImage: tutorProcedure
      .input(z.object({ questionId: z.string().uuid(), imageId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await assertOwnedDraft(ctx.tx, ctx.membership.userId, input.questionId);
        } catch (e) {
          if (e instanceof DraftNotFoundError || e instanceof StudentNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: (e as { code: string }).code });
          }
          throw e;
        }
        try {
          return await verifyImage(ctx.board.id, input.imageId);
        } catch (e) {
          if (e instanceof VerifyImageNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: "IMAGE_NOT_FOUND" });
          }
          throw e;
        }
      }),
  }),

  // Slice P: Parent read surface (the read side of Polaris #4). A parent
  // inspects a LINKED child's certified two-axis mastery (levels + the user-
  // visible description Stage-2 writes) with a per-sub_topic movement trend, plus
  // practice effort metrics. NO mastery move, NO AI, NO sign-off workflow (v0,
  // D-P-1). parentProcedure → authed + board + membership + role='parent' (M11
  // CHECK side). The per-child read asserts a parent_child link → a child the
  // caller isn't a parent of = NOT_FOUND (no existence leak; RLS scopes by board,
  // not user). The report exposes `description`, never the internal `log` (D-P-2).
  parent: router({
    listChildren: parentProcedure.query(({ ctx }) =>
      listChildren(ctx.tx, ctx.membership.userId),
    ),

    getChildReport: parentProcedure
      .input(z.object({ childId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getChildReport(ctx.tx, {
            parentUserId: ctx.membership.userId,
            childId: input.childId,
          });
        } catch (e) {
          if (e instanceof ChildNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    // Slice Report-Signoff (D-P-1 deferred half): the parent READ side. Only
    // PUBLISHED reports are visible (drafts never leak); ownership via
    // parent_child. The frozen snapshot is exactly what the tutor signed off.
    listReports: parentProcedure
      .input(z.object({ childId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await listReportsForParent(ctx.tx, {
            parentUserId: ctx.membership.userId,
            childId: input.childId,
          });
        } catch (e) {
          if (e instanceof ChildNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),

    getReport: parentProcedure
      .input(
        z.object({
          childId: z.string().uuid(),
          reportId: z.string().uuid(),
        }),
      )
      .query(async ({ ctx, input }) => {
        try {
          return await getReportForParent(ctx.tx, {
            parentUserId: ctx.membership.userId,
            childId: input.childId,
            reportId: input.reportId,
          });
        } catch (e) {
          if (e instanceof ChildNotFoundError || e instanceof ReportNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          throw e;
        }
      }),
  }),

  // Slice QA3-b: the admin topics.md ingest tool (D-QA3-6) — the SOLE prod
  // write-path for a chapter's curriculum spine + raw topics.md. adminProcedure
  // (role='admin', board-scoped). extract = one AI call → normalized preview
  // (D-QA3-b-1); commit = refuse-if-dependent → upsert spine + store blob.
  admin: router({
    // Chapter picker for the ingest UI (board-scoped via RLS).
    listChapters: adminProcedure.query(({ ctx }) => listChaptersForAdmin(ctx.tx)),

    // A MUTATION (one AI call, not cacheable). Runs INLINE — the admin waits for
    // the extraction, then reviews the preview before committing (D-QA3-b-1). Does
    // not write; returns { extracted, validation } so the FE can gate Confirm.
    extractTopicsMd: adminProcedure
      .input(z.object({ rawMd: z.string().min(1) }))
      .mutation(({ input }) => extractTopicsMd(input.rawMd)),

    // Commit the reviewed skeleton: re-validate → refuse-if-dependent → upsert
    // spine by slug → store the raw blob in chapter.metadata.topicsMd.
    commitTopicsMd: adminProcedure
      .input(
        z.object({
          chapterId: z.string().uuid(),
          rawMd: z.string().min(1),
          extracted: extractedTopicsMdSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await commitTopicsMd(ctx.tx, {
            boardId: ctx.board.id,
            chapterId: input.chapterId,
            rawMd: input.rawMd,
            extracted: input.extracted,
          });
        } catch (e) {
          if (e instanceof ChapterNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: e.code });
          }
          if (e instanceof TopicsMdInvalidError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.errors.join("; ") });
          }
          if (e instanceof ChapterHasDependentDataError) {
            throw new TRPCError({ code: "CONFLICT", message: e.message });
          }
          throw e;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
