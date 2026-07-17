/**
 * Slice S2R-3 — Stage-2b's SYNTHESIS segment: the first thing in the system that
 * reasons ABOVE the sub-topic.
 *
 * Stage 2a certifies each sub-topic in a silo, deliberately (assessment_session.ts).
 * That silo is what keeps certification honest, and it is also why nothing until
 * now could say "their language keeps letting them down across the whole subject" —
 * a claim no single sub-topic's evidence can support. Synthesis is where the
 * sitting's evidence is finally pooled and that claim becomes possible.
 *
 * IT ALWAYS RUNS AT FINALIZE (D-S2R-3). The chat is optional (D-S2R-2); this is
 * not. If synthesis only ran when a tutor opened the chat, the accept-all fast
 * path — the COMMON path — would silently strand every store below, and nothing
 * would error. Mastery would move and the chapter/subject view would just quietly
 * never update.
 *
 * WHAT IT WRITES, under spec §5's split rule:
 *   STATE   → student_chapter_insight / student_subject_insight (free-form,
 *             incremental) + horizontal_skill_state (level + prose).
 *   ACTIONS → cross_concept_flag, the existing clearable worklist.
 * The rule is the whole reason the worklist stays useful: without it, standing
 * observations pile into a queue meant for things a tutor DOES.
 *
 * WHAT IT READS: the sitting's drafts + the tutor's finals, the pooled
 * `non_subtopic_note`s (S2R-1's output — this is the consumer that field was built
 * upstream to feed), the current insight text, and the horizontal taxonomy for the
 * chapters in scope.
 *
 * ⚠️ THE MODEL NEVER EMITS AN ID. Every chapter/subject is addressed by an opaque
 * short key (C1/S1) minted here and resolved in code; horizontal slugs must come
 * from the in-scope taxonomy (D-S2R-4 — PREDEFINED, not invented). Anything that
 * does not resolve is DROPPED and counted, never coerced. An LLM guessing a uuid
 * from free text is exactly what cross_concept_flag's v1 refused to do.
 */
import { Type } from "@google/genai";
import { and, eq, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  chapter,
  crossConceptFlag,
  horizontalSkill,
  horizontalSkillState,
  observation,
  studentChapterInsight,
  studentSubjectInsight,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { geminiJson } from "./ai/gemini";

type Tx = PgTransaction<any, any, any>;

export const SYNTHESIS_SYSTEM = `You are the SYNTHESIS segment of Stage 2 in a two-axis mastery engine. Stage 2a has already certified each sub-topic in this sitting, in isolation. Your job is the part no sub-topic call could do: look across ALL of them at once and say what is true of the student ABOVE the sub-topic.

YOU DO NOT CERTIFY SUB-TOPICS. The levels and descriptions you are shown are ALREADY FINAL — a tutor has signed them off. Never re-litigate them, never propose changing them. They are your evidence, not your subject.

WHAT YOU PRODUCE, and the split that governs it:
- STATE — what is TRUE of this student right now → the chapter and subject insight text, and the horizontal-skill levels.
- ACTIONS — what someone should DO about it → worklist items.
A standing fact is not an action; "their algebra is weak" is state, "re-teach factorising before the next quadratics session" is an action. Putting state in the worklist clogs a queue a tutor is meant to clear.

INCREMENTAL, ALWAYS. You are shown the CURRENT insight text. One assignment never completes a chapter or subject view — it refines it. EDIT the existing text where it still holds, REWRITE only the parts this sitting's evidence actually contradicts or supersedes. Do not discard prior observations because this sitting did not re-witness them; absence of evidence in one sitting is not evidence of change. If this sitting adds nothing to a chapter or subject, return its text UNCHANGED rather than padding it.

HORIZONTAL SKILLS: a horizontal is a skill that cuts across content — language precision, causal reasoning, quantitative thinking. You may ONLY use the slugs listed in the HORIZONTAL TAXONOMY below. They are predefined by the curriculum; you never invent one, and a signal that matches no listed slug belongs in the worklist or the insight prose instead.
- Each slug is described PER CHAPTER — the same skill looks different in different chapters, and you may be shown several descriptions for one slug. They are LENSES ON ONE SKILL, not separate skills. Level the skill ONCE for the subject, reading all its lenses together.
- Level 1–5, same spirit as the content ladders: 1 = the skill actively breaks the work; 5 = reliably strong, unprompted.
- ONE RULE DECIDES WHETHER A HORIZONTAL APPEARS AT ALL: emit it if and only if THIS sitting's evidence gives you a level you can point at evidence for. If it does not, OMIT the entry entirely — no entry, no null level, no restated prose. There is no third option and no completeness to serve: a skill this sitting says nothing about keeps exactly the standing it already had, and SILENCE is how you say so. Omitting is never a retraction and never a gap — it is the normal case for most horizontals in most sittings. If you cannot name the evidence, omit it.
- prose: the EVIDENCE behind the level — what you actually saw, quoted or paraphrased from the notes. A level without evidence is unauditable, so an entry you cannot write prose for is an entry you should not have emitted.
- Inventing a level from no evidence is the one unrecoverable error here: downstream it is indistinguishable from a real read. Omitting costs nothing; guessing costs a number a tutor will believe.

THE SITTING MAY CARRY A CHAT TRANSCRIPT — the tutor talking with an advisory model about the drafts before finalizing (S2R-4). Read it for what the TUTOR states: a tutor turn can carry context nothing else in this sitting has ("he was ill that week", "I taught this in Hindi", "we only covered half the chapter"), and that context is real evidence for YOUR outputs. The advisory model's turns are NOT evidence — never treat something the model said as something the student did. And nothing in the transcript changes the certified levels: they are final regardless of what either party said. If the transcript is empty or adds nothing, synthesize EXACTLY as you would without it.

YOUR PRIMARY RAW MATERIAL is the pooled NON-SUB-TOPIC NOTES. Stage 1 is the only stage that ever saw the student's raw answer, and it recorded there anything that did not belong to the sub-topic being scored. Nobody else is looking at these. A single such note is an anecdote; the SAME thing across several notes is a pattern, and patterns are what you exist to find. Say which it is — do not inflate one slip into a standing weakness.

Be concrete and be honest about thin evidence. "Some difficulty with wording" is worthless to a tutor; "twice wrote 'speed' where the question established 'velocity', losing the direction each time" is actionable. If the sitting genuinely shows nothing above the sub-topic, say so and return empty lists — an empty, honest synthesis is far better than a confident invented one.`;

/** What one horizontal's chapter-lens looks like to the model. */
type TaxonomyEntry = { slug: string; subjectKey: string; lenses: Array<{ chapterName: string; description: string }> };

export type SynthesisScope = {
  /** C1 → chapter row. */
  chapters: Map<string, { id: string; name: string; subjectKey: string; currentInsight: string | null }>;
  /** S1 → subject row. */
  subjects: Map<string, { id: string; name: string; grade: string; currentInsight: string | null }>;
  taxonomy: TaxonomyEntry[];
  currentHorizontals: Array<{ subjectKey: string; slug: string; level: number | null; prose: string }>;
};

export type SynthesisCallInput = {
  scope: SynthesisScope;
  certified: Array<{
    subTopicName: string;
    chapterKey: string;
    conceptualLevel: number | null;
    proceduralLevel: number | null;
    description: string;
  }>;
  notes: Array<{ subTopicName: string; axis: string; level: number; note: string; at: Date }>;
  /** S2R-4 — the sitting's 2b chat, oldest first. Empty on the accept-all path. */
  chat: Array<{ role: "tutor" | "assistant"; text: string }>;
};

export const synthesisSchema = z.object({
  chapterInsights: z
    .array(z.object({ chapterKey: z.string(), insight: z.string().min(1) }))
    .default([]),
  subjectInsights: z
    .array(z.object({ subjectKey: z.string(), insight: z.string().min(1) }))
    .default([]),
  horizontals: z
    .array(
      z.object({
        subjectKey: z.string(),
        slug: z.string(),
        level: z.number().int().min(1).max(5).nullable().default(null),
        prose: z.string().min(1),
      }),
    )
    .default([]),
  worklistItems: z.array(z.object({ note: z.string().min(1) })).default([]),
  reasoning: z.string().min(1),
});
export type SynthesisResult = z.infer<typeof synthesisSchema>;

const synthesisGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    chapterInsights: {
      type: Type.ARRAY,
      description:
        "one entry per chapter whose view this sitting actually changes; omit a chapter this sitting adds nothing to",
      items: {
        type: Type.OBJECT,
        properties: {
          chapterKey: { type: Type.STRING, description: "the C-key from the scope list — never a uuid" },
          insight: { type: Type.STRING, description: "the FULL updated text (edited from current, not a diff)" },
        },
        required: ["chapterKey", "insight"],
      },
    },
    subjectInsights: {
      type: Type.ARRAY,
      description: "one entry per subject whose view this sitting actually changes",
      items: {
        type: Type.OBJECT,
        properties: {
          subjectKey: { type: Type.STRING, description: "the S-key from the scope list — never a uuid" },
          insight: { type: Type.STRING, description: "the FULL updated text (edited from current, not a diff)" },
        },
        required: ["subjectKey", "insight"],
      },
    },
    horizontals: {
      type: Type.ARRAY,
      description:
        "ONLY horizontals this sitting's evidence gives a real read on — omit the rest entirely (omission = unchanged standing, not a gap). slug MUST come from the provided taxonomy.",
      items: {
        type: Type.OBJECT,
        properties: {
          subjectKey: { type: Type.STRING, description: "the S-key this skill is levelled for" },
          slug: { type: Type.STRING, description: "a slug from the HORIZONTAL TAXONOMY — never invented" },
          // `nullable` stays true and `level` stays out of `required` DELIBERATELY:
          // the model is told never to emit a level-less entry, but the wire must
          // still be able to REPRESENT one, or a disobedient response becomes a
          // parse error instead of something writeSynthesis can safely drop.
          level: {
            type: Type.INTEGER,
            nullable: true,
            description: "1–5, the level this sitting's evidence supports. Cannot evidence one? Omit the whole entry — never emit it without a level.",
          },
          prose: { type: Type.STRING, description: "the evidence behind the level" },
        },
        required: ["subjectKey", "slug", "prose"],
      },
    },
    worklistItems: {
      type: Type.ARRAY,
      description: "ACTIONS only — things a tutor should DO. State belongs in the insight text.",
      items: {
        type: Type.OBJECT,
        properties: { note: { type: Type.STRING, description: "one concrete action" } },
        required: ["note"],
      },
    },
    reasoning: { type: Type.STRING, description: "what you read across the sitting and why" },
  },
  required: ["reasoning"],
} as const;

/**
 * Gather everything synthesis needs — PURE READS on the caller's tx.
 *
 * Same split as gatherStage2Input/runStage2Call, and for the same reason: the
 * caller's single transaction cannot serve concurrent queries, and the AI call
 * must not sit between DB reads. Gather here, call off the tx, write after.
 */
export async function gatherSynthesisInput(
  tx: Tx,
  args: {
    studentId: string;
    subTopicIds: string[];
    certified: Array<{
      subTopicId: string;
      conceptualLevel: number | null;
      proceduralLevel: number | null;
      description: string;
    }>;
    /** S2R-4 — the sitting's chat messages ({role: 'user'|'assistant', text}).
     *  The tutor's turns can carry context no stored evidence has; the model's
     *  turns are passed for coherence but flagged as non-evidence (see
     *  SYNTHESIS_SYSTEM). Omitted/empty = the accept-all path, no transcript. */
    chatMessages?: Array<{ role: string; text: string }>;
  },
): Promise<SynthesisCallInput> {
  // sub_topic → chapter → subject for the whole sitting.
  const rows = await tx
    .select({
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectGrade: subject.grade,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .where(inArray(subTopic.id, args.subTopicIds));

  // Mint the opaque keys. A sitting can span several chapters (interleaved) and —
  // for the catch-all, which pools whatever is loose — several SUBJECTS too.
  const subjectKeyById = new Map<string, string>();
  const chapterKeyById = new Map<string, string>();
  const subjects: SynthesisScope["subjects"] = new Map();
  const chapters: SynthesisScope["chapters"] = new Map();

  for (const r of rows) {
    if (!subjectKeyById.has(r.subjectId)) {
      const key = `S${subjectKeyById.size + 1}`;
      subjectKeyById.set(r.subjectId, key);
      subjects.set(key, {
        id: r.subjectId,
        name: r.subjectName,
        grade: r.subjectGrade,
        currentInsight: null,
      });
    }
    if (!chapterKeyById.has(r.chapterId)) {
      const key = `C${chapterKeyById.size + 1}`;
      chapterKeyById.set(r.chapterId, key);
      chapters.set(key, {
        id: r.chapterId,
        name: r.chapterName,
        subjectKey: subjectKeyById.get(r.subjectId)!,
        currentInsight: null,
      });
    }
  }

  const chapterIds = [...chapterKeyById.keys()];
  const subjectIds = [...subjectKeyById.keys()];

  // Current insight text — what synthesis edits rather than replaces.
  if (chapterIds.length) {
    const cur = await tx
      .select()
      .from(studentChapterInsight)
      .where(
        and(
          eq(studentChapterInsight.studentId, args.studentId),
          inArray(studentChapterInsight.chapterId, chapterIds),
        ),
      );
    for (const c of cur) {
      const key = chapterKeyById.get(c.chapterId);
      if (key) chapters.get(key)!.currentInsight = c.insight;
    }
  }
  if (subjectIds.length) {
    const cur = await tx
      .select()
      .from(studentSubjectInsight)
      .where(
        and(
          eq(studentSubjectInsight.studentId, args.studentId),
          inArray(studentSubjectInsight.subjectId, subjectIds),
        ),
      );
    for (const s of cur) {
      const key = subjectKeyById.get(s.subjectId);
      if (key) subjects.get(key)!.currentInsight = s.insight;
    }
  }

  // The taxonomy for the chapters in scope, folded to ONE entry per
  // (subject, slug) carrying every chapter lens (D-S2R-8).
  const taxRows = chapterIds.length
    ? await tx
        .select({
          slug: horizontalSkill.slug,
          description: horizontalSkill.description,
          subjectId: horizontalSkill.subjectId,
          chapterName: chapter.name,
        })
        .from(horizontalSkill)
        .innerJoin(chapter, eq(chapter.id, horizontalSkill.chapterId))
        .where(inArray(horizontalSkill.chapterId, chapterIds))
    : [];
  const taxByKey = new Map<string, TaxonomyEntry>();
  for (const t of taxRows) {
    const subjectKey = subjectKeyById.get(t.subjectId);
    if (!subjectKey) continue;
    const k = `${subjectKey}::${t.slug}`;
    if (!taxByKey.has(k)) taxByKey.set(k, { slug: t.slug, subjectKey, lenses: [] });
    taxByKey.get(k)!.lenses.push({ chapterName: t.chapterName, description: t.description });
  }

  // The student's standing on those skills today.
  const curH = subjectIds.length
    ? await tx
        .select()
        .from(horizontalSkillState)
        .where(
          and(
            eq(horizontalSkillState.studentId, args.studentId),
            inArray(horizontalSkillState.subjectId, subjectIds),
          ),
        )
    : [];

  // THE POOL — S2R-1's whole reason for going first. Every non-subtopic note the
  // sitting's sub-topics have ever collected, with the legacy home as a fallback
  // so pre-S2R-1 rows are not silently invisible (the same two-home read
  // draftStage2 does).
  const obs = await tx
    .select({
      subTopicId: observation.subTopicId,
      axis: observation.axis,
      observationLevel: observation.observationLevel,
      tutorLevel: observation.tutorLevel,
      nonSubtopicNote: observation.nonSubtopicNote,
      signals: observation.signals,
      createdAt: observation.createdAt,
    })
    .from(observation)
    .where(
      and(
        eq(observation.studentId, args.studentId),
        inArray(observation.subTopicId, args.subTopicIds),
      ),
    );

  const nameBySubTopic = new Map(rows.map((r) => [r.subTopicId, r.subTopicName]));
  const notes: SynthesisCallInput["notes"] = [];
  for (const o of obs) {
    const note = o.nonSubtopicNote ?? (o.signals as any)?.crossConceptNote ?? null;
    if (!note) continue;
    notes.push({
      subTopicName: nameBySubTopic.get(o.subTopicId) ?? o.subTopicId,
      axis: o.axis,
      // The EFFECTIVE level — a tutor correction outranks the machine read
      // everywhere else that counts, and it must here too.
      level: o.tutorLevel ?? o.observationLevel,
      note,
      at: o.createdAt,
    });
  }
  notes.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    scope: {
      chapters,
      subjects,
      taxonomy: [...taxByKey.values()],
      currentHorizontals: curH.map((h) => ({
        subjectKey: subjectKeyById.get(h.subjectId)!,
        slug: h.slug,
        level: h.level,
        prose: h.prose,
      })),
    },
    certified: args.certified.map((c) => {
      const r = rows.find((x) => x.subTopicId === c.subTopicId);
      return {
        subTopicName: r?.subTopicName ?? c.subTopicId,
        chapterKey: r ? chapterKeyById.get(r.chapterId)! : "?",
        conceptualLevel: c.conceptualLevel,
        proceduralLevel: c.proceduralLevel,
        description: c.description,
      };
    }),
    notes,
    chat: (args.chatMessages ?? []).map((m) => ({
      role: m.role === "user" ? ("tutor" as const) : ("assistant" as const),
      text: m.text,
    })),
  };
}

/** The ONE AI call. Touches no DB — see gatherSynthesisInput's note. */
export async function runSynthesisCall(i: SynthesisCallInput): Promise<SynthesisResult> {
  const lvl = (n: number | null) => (n == null ? "not yet observed" : String(n));

  const subjectBlock = [...i.scope.subjects.entries()]
    .map(
      ([k, s]) =>
        `  [${k}] ${s.name} (${s.grade})\n      current subject insight: ${
          s.currentInsight ?? "(none yet — this is the first)"
        }`,
    )
    .join("\n");

  const chapterBlock = [...i.scope.chapters.entries()]
    .map(
      ([k, c]) =>
        `  [${k}] ${c.name}  (subject ${c.subjectKey})\n      current chapter insight: ${
          c.currentInsight ?? "(none yet — this is the first)"
        }`,
    )
    .join("\n");

  const taxBlock = i.scope.taxonomy.length
    ? i.scope.taxonomy
        .map(
          (t) =>
            `  - slug=${t.slug} (subject ${t.subjectKey})\n` +
            t.lenses
              .map((l) => `      lens · ${l.chapterName}: ${l.description}`)
              .join("\n"),
        )
        .join("\n")
    : "  (no horizontal skills are defined for the chapters in this sitting — return an empty horizontals list)";

  const curHBlock = i.scope.currentHorizontals.length
    ? i.scope.currentHorizontals
        .map((h) => `  - ${h.slug} (subject ${h.subjectKey}): level=${lvl(h.level)} — ${h.prose}`)
        .join("\n")
    : "  (none yet — no horizontal has been levelled for this student)";

  const certBlock = i.certified
    .map(
      (c) =>
        `  - ${c.subTopicName} (chapter ${c.chapterKey}): conceptual=${lvl(
          c.conceptualLevel,
        )}, procedural=${lvl(c.proceduralLevel)}\n      ${c.description}`,
    )
    .join("\n");

  const noteBlock = i.notes.length
    ? i.notes
        .map(
          (n, x) =>
            `  [${x + 1}] from "${n.subTopicName}" (axis=${n.axis}, that answer scored ${n.level}) at ${n.at.toISOString()}\n      ${n.note}`,
        )
        .join("\n")
    : "  (none — no answer in this sitting revealed anything outside its sub-topic)";

  const chatBlock = i.chat.length
    ? i.chat
        .map((m) => `  ${m.role === "tutor" ? "TUTOR" : "ADVISOR"}: ${m.text}`)
        .join("\n")
    : "  (none — the tutor finalized without opening the chat)";

  const prompt = `SUBJECTS IN SCOPE:
${subjectBlock}

CHAPTERS IN SCOPE:
${chapterBlock}

HORIZONTAL TAXONOMY (the ONLY slugs you may use; several lenses = one skill):
${taxBlock}

THIS STUDENT'S CURRENT HORIZONTAL STANDING:
${curHBlock}

CERTIFIED THIS SITTING (FINAL — signed off by the tutor; evidence for you, not open to revision):
${certBlock}

POOLED NON-SUB-TOPIC NOTES (${i.notes.length}; oldest first — your primary raw material):
${noteBlock}

CHAT TRANSCRIPT THIS SITTING (tutor ↔ advisory model, before finalize; TUTOR turns are evidence, ADVISOR turns are not):
${chatBlock}

Read across the whole sitting. Update the chapter/subject insight text incrementally, level only the horizontals this evidence actually supports, and emit worklist ACTIONS. Return the structured JSON.`;

  const raw = await geminiJson<unknown>({
    label: "stage2:synthesis",
    systemInstruction: SYNTHESIS_SYSTEM,
    prompt,
    responseSchema: synthesisGeminiSchema as never,
    // Uncapped for the same reason as the 2a draft (M28): on a thinking model
    // maxOutputTokens bounds thinking + answer together, and this call reasons
    // across a whole sitting. A cap near the answer size starves the JSON.
    maxOutputTokens: null,
  });

  return synthesisSchema.parse(raw);
}

export type SynthesisWriteResult = {
  chapterInsights: number;
  subjectInsights: number;
  horizontals: number;
  worklistItems: number;
  /** Emitted-but-unresolvable output, dropped rather than coerced. */
  dropped: string[];
};

/**
 * Commit synthesis. Runs inside the caller's finalize tx (D-S2R-1) — if this
 * throws, the certifications roll back with it.
 *
 * Every key the model emitted is resolved against the scope it was GIVEN. An
 * unresolvable key is dropped and reported, never guessed at: a wrong chapter's
 * insight is worse than a missing one, because nothing downstream can tell it is
 * wrong. Same for a horizontal slug outside the taxonomy — D-S2R-4 makes the
 * taxonomy predefined, so an unlisted slug is a model error, not a new skill.
 */
export async function writeSynthesis(
  tx: Tx,
  args: {
    boardId: string;
    studentId: string;
    sessionId: string;
    scope: SynthesisScope;
    result: SynthesisResult;
  },
): Promise<SynthesisWriteResult> {
  const { scope, result } = args;
  const dropped: string[] = [];
  const out: SynthesisWriteResult = {
    chapterInsights: 0,
    subjectInsights: 0,
    horizontals: 0,
    worklistItems: 0,
    dropped,
  };

  for (const ci of result.chapterInsights) {
    const ch = scope.chapters.get(ci.chapterKey);
    if (!ch) {
      dropped.push(`chapterInsight: unknown chapterKey '${ci.chapterKey}'`);
      continue;
    }
    await tx
      .insert(studentChapterInsight)
      .values({
        boardId: args.boardId,
        studentId: args.studentId,
        chapterId: ch.id,
        insight: ci.insight,
      })
      .onConflictDoUpdate({
        target: [studentChapterInsight.studentId, studentChapterInsight.chapterId],
        set: { insight: ci.insight, updatedAt: new Date() },
      });
    out.chapterInsights++;
  }

  for (const si of result.subjectInsights) {
    const sj = scope.subjects.get(si.subjectKey);
    if (!sj) {
      dropped.push(`subjectInsight: unknown subjectKey '${si.subjectKey}'`);
      continue;
    }
    await tx
      .insert(studentSubjectInsight)
      .values({
        boardId: args.boardId,
        studentId: args.studentId,
        subjectId: sj.id,
        insight: si.insight,
      })
      .onConflictDoUpdate({
        target: [studentSubjectInsight.studentId, studentSubjectInsight.subjectId],
        set: { insight: si.insight, updatedAt: new Date() },
      });
    out.subjectInsights++;
  }

  // The taxonomy gate: a slug is only writable for a subject that actually
  // defines it (D-S2R-4).
  const allowed = new Set(scope.taxonomy.map((t) => `${t.subjectKey}::${t.slug}`));
  for (const h of result.horizontals) {
    const sj = scope.subjects.get(h.subjectKey);
    if (!sj) {
      dropped.push(`horizontal: unknown subjectKey '${h.subjectKey}'`);
      continue;
    }
    if (!allowed.has(`${h.subjectKey}::${h.slug}`)) {
      dropped.push(`horizontal: slug '${h.slug}' is not in ${h.subjectKey}'s taxonomy`);
      continue;
    }

    // ⚠️ THE BOUND: a level only ever goes null → number, NEVER back. Same rule
    // mastery_state holds, and for the same reason — null means NOT YET OBSERVED,
    // it is not a low score, and it is not a retraction.
    //
    // This is not hypothetical, and the history matters. The prompt USED to tell the
    // model to report "no read" as level=null; a plain upsert then wrote that null
    // straight over a real level, so a catch-all sitting about motion graphs
    // silently reset language_precision from 2 → null. ANY later sitting on
    // unrelated material would erase a standing a tutor had already seen.
    //
    // The prompt now says OMIT instead, so a null SHOULD never arrive here. This
    // guard stays anyway, and is deliberately unreachable-by-design rather than
    // dead: the prompt is not an enforcement mechanism, and the wire can still
    // represent a level-less entry (see synthesisGeminiSchema). It is what stands
    // between one disobedient response and a wiped standing. A null read is
    // INSERT-ONLY — it can create a first row, never overwrite one. A real level
    // always writes. Probed directly (the model no longer exercises this path).
    const q = tx.insert(horizontalSkillState).values({
      boardId: args.boardId,
      studentId: args.studentId,
      subjectId: sj.id,
      slug: h.slug,
      level: h.level,
      prose: h.prose,
    });
    if (h.level == null) {
      await q.onConflictDoNothing({
        target: [
          horizontalSkillState.studentId,
          horizontalSkillState.subjectId,
          horizontalSkillState.slug,
        ],
      });
    } else {
      await q.onConflictDoUpdate({
        target: [
          horizontalSkillState.studentId,
          horizontalSkillState.subjectId,
          horizontalSkillState.slug,
        ],
        // prose moves WITH the level: it is the evidence FOR that level, and a
        // level explained by another sitting's evidence is unauditable.
        set: { level: h.level, prose: h.prose, updatedAt: new Date() },
      });
    }
    out.horizontals++;
  }

  for (const w of result.worklistItems) {
    await tx.insert(crossConceptFlag).values({
      boardId: args.boardId,
      studentId: args.studentId,
      origin: "stage2_synthesis",
      fromSubTopicId: null,
      note: w.note,
      sourceObservationId: null,
      sourceSessionId: args.sessionId,
    });
    out.worklistItems++;
  }

  return out;
}
