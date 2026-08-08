# Build principles

How work gets done in this repo, and — more importantly — **how we decide that
something is actually finished.**

[`CLAUDE.md`](../CLAUDE.md) is the operational rulebook: commands, conventions,
traps. This document is the reasoning underneath it. If the two ever disagree,
`CLAUDE.md` wins on mechanics and this one wins on judgement.

Every principle here is written from an incident. They are in rough order of how
much time they save.

---

## 1. Ship slices, not branches

A **slice** is one coherent behavioural change, delivered whole:

> schema change (if any) → service logic → router → frontend → **a probe that
> proves it** → the docs updated

Slices are small enough to hold in your head and complete enough to be judged.
There is no "backend half landed, frontend next week" state — that state cannot be
verified, so it cannot be trusted.

Corollaries:

- **Don't widen scope mid-slice.** Found something else broken? Write it down,
  finish the slice, raise it separately. A slice that grows a second purpose stops
  being reviewable.
- **Don't narrow it either.** Half a slice with the probe skipped is worse than not
  starting, because it looks done.
- **An uncommitted slice is a normal resting state.** Slices routinely sit in the
  working tree across sessions here, deliberately. A dirty tree is not a mess to be
  cleaned up — but it *is* volatile storage, so see §9.

---

## 2. The probe is the specification

There is no unit-test suite. `scripts/probe_*.ts` is the test suite, and it is
also the only durable record of *why* a behaviour matters.

Read the header of any probe in this repo. It doesn't say "tests the chat
service." It says which production incident it exists to prevent, on what date,
for which student, and what the tutor saw. That header is the spec. The
assertions below it are the executable form of the spec.

**So: when you fix a bug, the probe header is where the bug's story goes.** The
code comment explains the mechanism; the probe header explains the consequence.
Six months later the mechanism will have been refactored and the consequence will
still be true.

Delete a probe only when the behaviour it guards is genuinely gone. Never because
it went red.

---

## 3. 🔑 A test that cannot fail is not a test — build the negative control

This is the highest-leverage habit in the repo, and the one most often skipped.

**After you write a passing check, break the thing on purpose and confirm the
check goes red.** Not "convince yourself it would." Actually break it. Actually
run it.

The failure this prevents is specific and common: **an assertion that passes
against the buggy code too.**

> Worked example. A proposal was being lost when a tutor switched student and came
> back. The fix persisted it to a column. The obvious probe writes the row and
> reads it back — and that probe passes against the *broken* code, because the bug
> was never in the write. It was in the read path after a remount.
>
> The probe only became real once every restore assertion read through a
> **separate `withBoard()` call** — a fresh transaction, the in-process analogue of
> the component remounting. Then, with the fix reverted, exactly the 13 restore
> legs went red and nothing else. *That* split is the evidence.

The general form: your negative control should red **precisely** the legs that
cover the defect, and no others. If reverting the fix reds everything, your probe
is coupled to something incidental. If it reds nothing, your probe is decorative.

The same discipline applies to one-off shell verification. `rsync -azn` with no
`-i` or `-v` **prints nothing at all**, which is indistinguishable from "nothing
will be deleted." A runbook step that said "dry-run first" was therefore a silent
no-op that read like a safety check — and it survived five deploys before anyone
noticed it had never once produced output. On the sixth, run with `-azni`, it
listed ten deletions including two production database backups.

> **If a step produces the same output whether or not it worked, it is training
> you to ignore it.**

---

## 4. 🔑 A zero is not evidence

`0 rows`, `no matches`, `nothing found`, `count: 0` — none of these mean "clean."
They mean *your query returned nothing*, which is equally consistent with your
query being wrong.

This repo has three separate machines for producing a misleading zero:

1. **RLS.** No `app.board` claim set → every protected table reads empty. Silently.
2. **Board scoping.** The right query on the wrong board. Content trees are
   per-board; a student who moved boards has their history in the other one.
3. **Your own regex.** A grep anchored on `$` against a format that has a trailing
   field returns 0 for *every* input. It looks exactly like "nothing there."

> Worked example, from a live investigation. Asked to audit a tutor's recent
> authoring sessions, the first pass showed AI calls firing, images rendering — and
> **zero rows** in the worker table and **zero questions created**. That reads
> unmistakably as "the run produced nothing; something is badly broken."
>
> Nothing was broken. Every query had been scoped to CBSE. The session was on
> Cambridge. The board filter was hiding a completely successful run.

**The fix is cheap and you should make it a reflex: pair every "nothing found"
with a control.** Query something you know exists. Query something you know does
not. If the known-present case also returns zero, your instrument is broken, not
the system.

Two controls, ten seconds, and you don't spend an afternoon debugging a bug that
isn't there — or worse, report one.

---

## 5. Instrument the layer where failure actually lives

`ok = true` in `ai_call_log` means *the vendor returned a response*. It does not
mean the operation succeeded. A response can be complete, well-formed at the HTTP
layer, logged as a clean success — and then fail to parse, fail validation, or
throw three frames downstream. The log row still says `ok=t`.

There is a known live case of exactly this: a complete, `finish=stop` response that
the JSON extractor cannot close, throwing upstream of everything the metrics see.

So when someone reports "it didn't work" and your dashboard is green, the dashboard
is answering a different question than the one you asked. Go to the application
logs, and go to the artifact the operation was supposed to produce.

**Ask "what would this metric say if the thing had failed?" If the answer is "the
same", it isn't measuring the thing.**

The same trap in a different costume: a verification verdict that can be
**overridden in place**. If a human can wave through a failed check and the
override rewrites the stored verdict to `PASS`, then every later query that counts
`PASS` is counting two different things — genuinely passed, and known-broken but
approved. The count looks healthy. It is not.

> If an outcome can be overridden, the override must be a **distinct state**, not a
> mutation of the original verdict. Otherwise you have destroyed the only signal
> that would have told you your check is too strict — or that someone is routinely
> ignoring it.

---

## 6. Verify the artifact, not the input

The recurring class: proving something about the thing you *sent*, and reporting it
as a fact about the thing that is *running*.

- A successful `rsync` proves bytes moved. It does not prove the service restarted.
- A matching file size proves nothing about a binary — **decode it on the target.**
- A build hash can be nondeterministic by design (a build stamp will do it), so a
  changed hash is not evidence of a changed behaviour, and an unchanged one is not
  evidence of a failed deploy.
- Grepping a minified bundle for a function name returns 0 because the name was
  minified away. **Grep for its string literals instead.**

The stronger form of the check: **grep for what must now be PRESENT and for what
must now be GONE.** A one-sided check passes against a deploy that didn't happen.

---

## 7. Say "never rendered" when nothing was rendered

Typecheck passes. Build succeeds. The probe is 40/40. The route answers over HTTP.

**None of that is a human looking at the screen.**

This repo went eight consecutive slices where every gate was green and nobody had
opened a browser. When someone finally did, the *first* walk found a defect no
probe had been capable of catching: a label read "mixed order" because it was
computed from what the planner had *assembled*, rather than from what could
actually be *served*. Every data assertion was correct. The screen was wrong.

Probes prove the data path. They cannot prove a thing is visible, legible, ordered
sensibly, or positioned anywhere a human would look.

So the reporting rule is blunt:

> **If nobody opened it in a browser, the status is "never rendered."**

Not "verified." Not "working." Not "should be fine." Write what you checked and
write what you didn't. A clearly stated gap is useful information. A confident
overclaim costs the next person a day and costs you the ability to be believed the
next time you say something is fine.

---

## 8. Investigate the report, not the hypothesis

When a production issue comes in, the reported symptom is a starting point, not a
diagnosis. The most efficient move is almost always to **reconstruct the timeline
from evidence** before forming a theory — the logs, the AI call log, the row
timestamps — because a plausible theory will otherwise steer every query you write.

> Worked example. Report: *"chat isn't persisting — switch student, come back, and
> previous messages are gone."* Obvious hypothesis: the JSONB message column is
> clobbering itself.
>
> The timeline said otherwise. **All ten messages were intact**, and every assistant
> turn matched the logged response length exactly. Nothing had ever been dropped.
>
> What vanished was a 16-question blueprint that had **never been stored at all** —
> it existed only in React state and in the AI call log. The user described it as
> "chat," because from where they sat, it was.
>
> A second detail changed the whole investigation: a deploy had restarted the
> backend mid-session. That felt like the cause. It wasn't — it was only the
> trigger. An F5 or a student switch reproduced it with no deploy anywhere near.
> Fixing "deploys are disruptive" would have fixed nothing.

Two lessons worth internalising:

- **Users describe symptoms in their own vocabulary.** Map their words onto your
  entities before you go looking, or you'll search for the wrong thing competently.
- **Distinguish the trigger from the cause.** The thing that was happening when it
  broke is usually not the reason it broke. It's just the thing that made the
  latent defect visible.

And when you state a finding, state it from the code you actually read. Reporting a
line's role from a grep hit-list — rather than from the function that encloses it —
turned "the frontend rehydrate already exists, this is free" into a claim that was
simply false, inside a scoping document someone was making a decision on.

---

## 9. Migrations, commits, and the volatile tree

An uncommitted slice is fine. **An untracked migration is not.**

A migration is two files — `drizzle/NNNN_*.sql` and `drizzle/meta/NNNN_snapshot.json`.
Untracked, they are one `git stash` from gone, while your local database sits ahead
of the repo in a way that is genuinely painful to reconstruct.

```bash
git status --short drizzle/   # before you stop working. Every time.
```

On committing and deploying, the rule is deliberately conservative because this
repo has no staging tier and production serves real families:

- **A green build is not consent to commit.**
- **A commit is not consent to deploy.**
- Both are explicit, human decisions, made by the maintainer.

Before a migration-carrying deploy, **prove the backup path works** — not that a
backup command exists. Take the dump, list it, confirm the tables are in it. And
check the tool versions: a database server can easily be two major versions ahead
of the `pg_dump` on an application box, in which case the backup you think you have
cannot be taken at all.

---

## 10. Write the reason, not just the code

Comments in this codebase are unusually dense, and deliberately so. They record
*why* a shape was chosen — frequently naming the incident that forced it.

```ts
// Null = legacy row → reads as 'one', the safe polarity: a missing value must
// never silently mean "spend N sub-topics of AI".
```

That comment is doing work no type signature can. It tells the next person which
direction to fail in, and it means a refactor that flips the default has to argue
with a stated reason instead of quietly reversing a decision nobody remembers
making.

**Match that density.** When you write a line whose shape is non-obvious — a
nullable that means something, a clamp, an ordering that matters, a deliberate
omission — write down why. Especially write down the things you *considered and
rejected*, because those are invisible in the diff and someone will otherwise
re-litigate them from scratch.

Prose explanations of behaviour are less useful than the code that shows it. A
`const LADDER = { … }` communicates faster than a paragraph describing the ladder.
Prefer showing.

---

## 11. Bounds, and the honesty of an insufficient fix

When you add a bound to something unbounded — a token cap, an array limit, a
retry ceiling — **check where the problem moves.**

> Worked example. An AI worker occasionally ran away, generating enormous output.
> The cause was traced to an unbounded array in an image specification, and a
> `maxItems` bound was applied.
>
> It did not work. The array was now capped at six elements — and the runaway
> simply moved *inside* element six, which had no length bound of its own. The
> total output was unchanged.

Two things were done right, and both are the point:

1. The insufficiency was **proved, not assumed** — the fix was tested and found
   wanting rather than declared complete because it was plausible.
2. It was **reported as insufficient** and the next lever was left explicitly
   undecided, rather than quietly shipped as a resolution.

A bound that moves a problem is worse than no bound, because it retires the alarm
without retiring the fault.

And measure the rate from real traffic, over enough events to mean something. Four
calls after a change is not a sample. If you can't tell yet, **say you can't tell
yet** — that is a complete and useful answer.

---

## 12. Adjacent things break; go look

Slices break their neighbours. Two probes in this repo were, at one point,
asserting behaviour that a later slice had deliberately deleted — and one had been
red for over a week before anyone ran it.

A probe that is red for a week is not a failing test. It is **no test at all**,
because by the time it matters nobody believes it. Worse, it trains everyone to
scroll past red.

So: run the siblings. Fix or delete what's red — deliberately, with a reason,
either way. "Red for unrelated reasons" is a decision that has to be made and
recorded, not a state you inherit and pass on.

---

## Appendix — the short version

```
Slice it whole. Probe it. Break the fix and watch the probe go red.
A zero is not evidence — add a control.
ok=true means the vendor answered, not that it worked.
Verify the artifact, not the input. What's present AND what's gone.
Nobody opened a browser → "never rendered."
Reconstruct the timeline before you form a theory.
Trigger ≠ cause.
Two files per migration. Check before you stop.
Green build ≠ consent to commit. Commit ≠ consent to deploy.
Write down why, especially what you rejected.
A bound that moves the problem is worse than none.
Run the siblings.
```
