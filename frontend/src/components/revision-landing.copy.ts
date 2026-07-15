// Slice REV-LAND — the landing's templated copy. ONE place to tune the voice
// without touching logic (the assessor-prompt lesson: prose iterates faster
// than code). No AI on landing: every line is a template over deterministic
// scheduler/plan/visit data (locked in brainstorm).
//
// State priority, checked top-first (locked with the founder):
//   no plan → retention due → plan's current chapter → returning → fresh.
// The headline follows the winning state; secondary chips (continue/due) may
// ride along so a one-tap resume is never more than one state away.
//
// UI copy rule (S76): hyphen "-", never an em-dash.

export type LandingChip =
  | { kind: "open"; subTopicId: string; label: string }
  | { kind: "plan"; label: string };

export type LandingScript = {
  headline: string;
  sub?: string;
  chips: LandingChip[];
};

/** The minimal structural slice of revision.getLandingState this file needs
 *  (kept structural so the copy file never imports the trpc client). */
export type LandingStateLike = {
  firstTime: boolean;
  lastVisited: { subTopicId: string; subTopicName: string; chapterName: string } | null;
  lastVisitedByChapter: Record<string, string>;
  dueTop: { subTopicId: string; subTopicName: string; chapterName: string } | null;
  plan: {
    currentChapter: { chapterId: string; name: string } | null;
    strongestChapter: { chapterId: string; name: string } | null;
  } | null;
};

export type FirstChapterRef = {
  chapterId: string;
  name: string;
  firstSubTopicId: string;
} | null;

export type LandingNavHelpers = {
  /** The board's first chapter (tree order), for the fresh-start chip. */
  firstChapter: FirstChapterRef;
  /** chapterId → its first sub_topic id (tree order); null if unknown. */
  firstSubTopicOf: (chapterId: string) => string | null;
};

export function pickLanding(
  state: LandingStateLike,
  name: string,
  { firstChapter, firstSubTopicOf }: LandingNavHelpers,
): LandingScript {
  const continueChip: LandingChip | null = state.lastVisited
    ? {
        kind: "open",
        subTopicId: state.lastVisited.subTopicId,
        label: `Continue ${state.lastVisited.subTopicName}`,
      }
    : null;

  // 1 - no set-up plan: the ownership moment comes first.
  if (!state.plan) {
    const chips: LandingChip[] = [{ kind: "plan", label: "Set my plan" }];
    if (continueChip) chips.push(continueChip);
    else if (firstChapter)
      chips.push({
        kind: "open",
        subTopicId: firstChapter.firstSubTopicId,
        label: `Start ${firstChapter.name}`,
      });
    return {
      headline: `Hi ${name}! What do you want to start with?`,
      sub: "Setting up a study plan helps me pace you - or just pick a chapter below.",
      chips,
    };
  }

  const strongestSub = state.plan.strongestChapter
    ? `You're strongest in ${state.plan.strongestChapter.name} right now.`
    : undefined;

  // 2 - something is due: fading memory beats new material.
  if (state.dueTop) {
    const chips: LandingChip[] = [
      {
        kind: "open",
        subTopicId: state.dueTop.subTopicId,
        label: `Revisit ${state.dueTop.subTopicName}`,
      },
    ];
    if (continueChip && continueChip.subTopicId !== state.dueTop.subTopicId)
      chips.push(continueChip);
    return {
      headline: `Hi ${name}, ${state.dueTop.subTopicName} from ${state.dueTop.chapterName} is due for a quick revisit.`,
      sub: "Memory fades - catching it early is the trick.",
      chips,
    };
  }

  // 3 - the plan's current chapter.
  if (state.plan.currentChapter) {
    const ch = state.plan.currentChapter;
    const inChapter = state.lastVisitedByChapter[ch.chapterId];
    const chapterStart = inChapter ?? firstSubTopicOf(ch.chapterId);
    const chips: LandingChip[] = [];
    if (chapterStart)
      chips.push({
        kind: "open",
        subTopicId: chapterStart,
        label: `${inChapter ? "Continue" : "Start"} ${ch.name}`,
      });
    if (continueChip && continueChip.subTopicId !== chapterStart)
      chips.push(continueChip);
    return {
      headline: inChapter
        ? `Hi ${name}, your plan has ${ch.name} in focus. Pick up where you left off?`
        : `Hi ${name}, your plan has ${ch.name} in focus. Ready to start it?`,
      sub: strongestSub,
      chips,
    };
  }

  // 4 - returning, nothing due, no plan focus.
  if (state.lastVisited) {
    return {
      headline: `Welcome back, ${name} - you were on ${state.lastVisited.subTopicName}. Keep going?`,
      sub: strongestSub,
      chips: [continueChip!],
    };
  }

  // 5 - fresh: plan set, nothing visited yet.
  const chips: LandingChip[] = firstChapter
    ? [
        {
          kind: "open",
          subTopicId: firstChapter.firstSubTopicId,
          label: `Start ${firstChapter.name}`,
        },
      ]
    : [];
  return {
    headline: `Hi ${name}, what do you want to start with?`,
    sub: "Pick a chapter below to begin.",
    chips,
  };
}
