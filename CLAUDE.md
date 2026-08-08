# CLAUDE.md — working rules for this repo

Read this before touching anything. It is written for a developer (or an AI agent)
picking up a **small change** without the history of how this codebase got here.

Every rule below exists because breaking it cost someone real time, or shipped a
real defect to real students. Where a rule looks arbitrary, the reason is stated —
read the reason before deciding the rule doesn't apply to you.

**Companion doc: [`docs/BUILD-PRINCIPLES.md`](docs/BUILD-PRINCIPLES.md)** — *how* we
decide something is done. This file is *what* to do; that one is *why*.

---

## 0. TL;DR — the eight rules

1. **`bun`, never `npm`.** This is a Bun workspace.
2. **Never run raw `git commit` / `git push` / deploy** unless explicitly asked. See §10.
3. **RLS is fail-closed.** Un-scoped reads return **zero rows, not an error**. See §4.
4. **A new tenant-scoped table is a two-file change** — `schema.ts` *and*
   `TENANT_SCOPED_TABLES`. See §5.
5. **A migration is two files** (`.sql` + snapshot). Both get committed, together. See §5.
6. **Every change ships with a probe run.** Typecheck is not proof. See §6.
7. **`bun --hot` does not pick up a NEW tRPC route.** Restart for real. See §7.
8. **Typecheck + build + a green probe is not a render.** If nobody opened a browser,
   say "never rendered." See §8.

---

## 1. What this is

Student-facing **b2c exam-prep app** — revision, practice, insights, and a
tutor-facing question-authoring surface. **Multi-tenant**: one deployment serves
several boards (CBSE, Cambridge, IGCSE) separated by a `board_id` column and
Postgres row-level security.

**This is in production and serves real families.** There is no staging tier.
The blast radius of a mistake here is a child's learning record.

### Stack

| Layer | Choice |
|---|---|
| Runtime | **Bun** (not Node) |
| HTTP | Hono, backend on `:3010` |
| API | tRPC v11 — one router, `src/trpc/router.ts` |
| DB | Postgres 17 + Drizzle ORM, **RLS enforced** |
| Queue | BullMQ on Redis |
| Frontend | React 19 + Vite on `:5174` |
| Shared kernel | `packages/kernel` — schema, contracts, mastery logic |
| AI | Claude via **CLI subprocess**, Gemini via API. See §9. |

### Layout

```
packages/kernel/src/
  schema.ts          ← ALL Drizzle tables + TENANT_SCOPED_TABLES. One source of truth.
  contracts.ts       ← zod contracts shared BE↔FE
  mastery.ts         ← two-axis mastery rules
src/
  index.ts           ← Hono entry, mounts tRPC
  trpc/
    context.ts       ← per-request ctx; resolves board from the `x-board` header
    init.ts          ← procedure ladder (see §3)
    router.ts        ← every procedure (large — grep, don't read whole)
  db/
    client.ts        ← the app connection (role b2c_app — RLS BINDS)
    with-board.ts    ← withBoard() — the ONLY correct way to touch a scoped table
    migrate.ts       ← runs migrations, then applies RLS from TENANT_SCOPED_TABLES
  services/          ← business logic; routers stay thin and call into here
  worker/            ← BullMQ processors (assessment, image render, authoring, …)
  config/env.ts      ← zod-validated env
scripts/             ← seeds + PROBES (see §6)
drizzle/             ← generated migrations + meta/ snapshots. COMMIT BOTH.
frontend/src/        ← React app
.claude/skills/      ← ⚠️ READ AT RUNTIME by the AI worker. See §9.
```

---

## 2. Local dev — you need FOUR processes

Three is the most common cause of a "mystery bug" in this repo.

```bash
docker compose up -d      # postgres :5435, redis :6381
bun install
bun run db:migrate        # applies migrations AND (re)applies RLS policies

# then, in four terminals:
bun run start                                   # 1. backend  :3010
cd frontend && bun run dev                      # 2. frontend :5174
bun run worker                                  # 3. BullMQ worker
cd ../nadi-pyrender && source .venv/bin/activate && python server.py   # 4. :8002
```

**Process 4 (`nadi-pyrender`) is a separate repo** and it is the silent one. It
renders matplotlib figures. When it is down, image generation fails with
`status 0` (no connection) and the UI surfaces something misleading like
*"simplify the description"* — which sends you debugging the AI prompt instead of
starting a server. **A `200` on `/` is not proof it can render**; post an actual
script.

Ports are deliberately offset (PG 5435 / Redis 6381 / BE 3010 / FE 5174) so this
stack coexists with sibling projects on one machine. Don't "fix" them to defaults.

**Leave no server running when you stop work.** The next person edits code, the
stale process keeps serving the old build, and the failure reads as a fresh bug.

---

## 3. The procedure ladder

Defined in `src/trpc/init.ts`. Pick the *weakest* one that is correct — never
reach for `publicProcedure` to make a test pass.

```
publicProcedure       → no auth
sessionProcedure      → a session exists
authedProcedure       → authenticated user
protectedProcedure    → authenticated + a resolved board membership   ← the default
tutorProcedure        → protected + role must be 'tutor'
parentProcedure       → protected + role must be 'parent'
adminProcedure        → protected + role AND an email allowlist
```

The role check is the **CHECK** side of the gate. The **SET** side is a real
`grantRole(...)` flow — a role is *data*, writable by anything that can write
rows, so never treat "has the role" as equivalent to "was granted it properly".

`adminProcedure` intentionally requires more than the role, because the role alone
is not a sufficient boundary for admin surfaces.

---

## 4. 🔴 Tenancy and RLS — the single biggest trap

Tables with a `board_id` have RLS **ENABLEd and FORCEd**, with this policy:

```sql
USING (board_id = NULLIF(current_setting('app.board', true), '')::uuid)
```

The app connects as the **non-superuser** role `b2c_app`, so the policy binds.
Migrations run as the owner.

### The failure mode

**With no `app.board` claim set, a protected table reads EMPTY. Not an error — empty.**

That is fail-closed and correct, but it means:

> **A `0` from a query is not evidence of a clean state. It is equally consistent
> with "you forgot to set the board."**

This has produced confidently wrong conclusions more than once. Whenever you get a
zero, an empty list, or "nothing found" — **before you believe it, prove your query
can return anything at all.** Add a control: query something you know exists, and
query something you know does not. If the known-present row also returns 0, your
scope is wrong, not the data.

### In application code

```ts
// The ONLY correct way to touch a scoped table.
await withBoard(boardId, async (tx) => {
  return tx.select().from(question).where(...);
});
```

`withBoard` opens a transaction and sets a **transaction-local** claim, so it
evaporates on commit. Never hoist a query out of the callback.

### In psql (prod or local)

```sql
set app.board = '<board-uuid>';   -- FIRST. Otherwise you will see nothing.
select ... ;
```

Board is per-**board**, and content trees are per-board. If you're looking for
something and it isn't there, **check the other board before concluding it's missing.**

### Board comes from a header

The board is resolved in `src/trpc/context.ts` from the **`x-board` HTTP header**,
not from a procedure input. The frontend sets it from a per-tab value. Consequence:
a stale value in one tab can scope a request to the wrong board. If a user reports
"my data vanished", suspect board resolution before you suspect data loss.

### Two user tables

- **`app_user`** — the domain user (this is the one you almost always want)
- **`users`** — Better Auth's own table

Joining `users` to a domain table returns a spurious `0` that reads as "clean".
Know which one you're in.

---

## 5. Schema changes

### Adding a tenant-scoped table is a TWO-FILE change

```ts
// 1. packages/kernel/src/schema.ts — define the table with board_id
// 2. packages/kernel/src/schema.ts — add it to TENANT_SCOPED_TABLES
```

Both in the **same** edit. `migrate.ts` derives RLS from `TENANT_SCOPED_TABLES` —
a table missing from that list is created **with no RLS at all**, silently, and
every board can read every other board's rows.

**Verify RLS actually landed** — check `pg_class`, not the migrate log:

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname = 'your_new_table';
-- both must be true
```

### Generating a migration

```bash
bun run db:generate    # writes drizzle/NNNN_*.sql AND drizzle/meta/NNNN_snapshot.json
bun run db:migrate     # applies it, then re-applies RLS
```

🔴 **A migration is TWO files and they are worthless apart.** If you generate one
and don't commit both, the local DB is ahead of the repo and the next person's
migrate breaks in a way that is hard to read. `git status drizzle/` before you
call anything done. An untracked migration is one `git stash` from gone.

### No Postgres enums

Model enums as `text` + a zod enum in `contracts.ts`, optionally a CHECK constraint.

Why: Drizzle batches pending migrations into a **single transaction**, and
Postgres forbids using a newly `ADD VALUE`'d enum member in the same transaction
that added it. So "add the value and seed a row using it" cannot be one migration.
Text sidesteps the whole class. Follow the existing convention.

### Nullable and additive by default

Prod has real data and there is no maintenance window. Prefer an additive,
nullable column with a documented legacy meaning over a backfill. When a null must
mean something, pick the **safe** polarity and write down why — e.g. a null
`author_grain` reads as `'one'`, because a missing value must never silently mean
"spend N sub-topics worth of AI credits."

---

## 6. Probes — how we prove things

`scripts/probe_*.ts` — 83 of them, one per slice, 79 wired as `bun run probe:<name>`
scripts (see `package.json`). **There is no unit-test suite. Probes are the test
suite.**

A probe is a standalone script that runs against a **real database with real RLS**.
It is not a mock. Conventions, all visible in `scripts/probe_proposal_persist.ts`:

- **A header comment stating the bug or behaviour it exists for.** If a probe was
  written because of a production incident, that incident is documented at the top.
  Do not delete these — they are the only record of why the assertion matters.
- **A throwaway board** (`Probe P` / `Probe Q`), created and fully torn down. Two
  boards, so cross-tenant isolation is proved rather than assumed.
- `check(name, ok)` per assertion, a `passed`/`failed` tally, and
  **`process.exit(failed === 0 ? 0 : 1)`** — so it is a real gate, not a log.
- **Real vendor calls are separated from no-vendor legs** and skipped *loudly*
  (`PROBE_NO_VENDOR=1` prints a SKIP line). Never silently.
- Full cleanup at the end. A probe that leaves litter is a broken probe.

### Writing a probe for your change

1. Assert the thing that was broken, in the way it actually broke.
2. **Then break the fix on purpose and re-run.** A probe that passes against the
   buggy code proves nothing. This is the single highest-value habit in this repo —
   it catches assertions that were testing the write when the bug was in the read.
3. Run the **sibling** probes for anything you touched. Slices routinely break a
   neighbour's assumptions, and a probe that has been red for a week tells you
   nothing on the day you need it.

### ⚠️ Stop the worker before any probe that enqueues

```bash
# the running `bun run worker` will STEAL the queued job
```

...and the probe then reports a false green, because something did process the
job — just not the thing under test. Applies to `probe:assessment`, `probe:vision`,
and anything else that goes through BullMQ.

### Probe HTTP legs have no timeout

Some probes make bare `fetch` calls. A **down** backend soft-skips cleanly. A
**wedged** backend hangs the whole suite with no output. If a probe run goes quiet,
that's the reason.

---

## 7. Restarts, hot reload, and what actually gets served

- `bun run dev` uses `--hot`. It picks up edits to existing code.
- **It does NOT register a NEW tRPC route.** Add a procedure, and it will 404 over
  HTTP until you do a real restart — while the code on disk looks perfect.
- `bun run start` is **not** hot at all. A green probe forks a fresh process and
  proves nothing about the server someone is about to click on.

**Before you tell anyone to go look at it, restart the backend.**

Proving a new route exists, properly:

```bash
# real restart first, then:
curl -s -o /dev/null -w '%{http_code}\n' localhost:3010/trpc/yourNewProcedure   # 401 = route exists
curl -s -o /dev/null -w '%{http_code}\n' localhost:3010/trpc/definitelyNotAThing # 404 = control
```

The 404 control is the point. A `401` alone doesn't distinguish "route exists and
rejected me" from "you misread the output."

---

## 8. What counts as done

Before you call a change complete, all of these:

```bash
bun run typecheck                    # backend — must be exit 0
cd frontend && bun run typecheck     # frontend — SEPARATE, must ALSO be exit 0
cd frontend && bun run build         # the build can fail when typecheck passes
bun run probe:<yours>                # your probe, green
bun run probe:<siblings>             # anything adjacent, still green
git status --short drizzle/          # empty, or both migration files staged
```

Run the frontend commands **from `frontend/`** and check you're actually there —
running `typecheck` from the root and reading a backend pass as a frontend pass is
a recurring mistake.

### The honesty rule

**Typecheck + build + a passing probe + an artifact grep is NOT a render.**

If no human has opened a browser and looked at the change, the correct thing to
write is **"never rendered."** Not "verified", not "working", not "should be fine."
A probe proves the data path. It cannot prove a card is visible, legible, or
positioned anywhere sane. Several defects here were invisible to a 30-leg probe and
obvious in the first two seconds of a human looking at the screen.

State what you verified and what you didn't. An honest gap is useful; a confident
overclaim costs the next person a day.

---

## 9. AI integration — the non-obvious parts

### Claude runs as a CLI subprocess, not the SDK

Authoring calls **spawn the Claude CLI**. Auth is the OAuth login on the machine,
*not* an API key.

⚠️ A set `ANTHROPIC_API_KEY` **silently kills the call before it reaches the API** —
the giveaway is `duration_api_ms: 0` in the log. Verify with `env -u ANTHROPIC_API_KEY`.

### Two Gemini paths, and they are not interchangeable

- The worker's `geminiJson` — **stateless**, one shot
- Assessment/master chat — **resumable**, carries interaction state

Reading only one file and generalising gives a confidently wrong answer about how
conversation state works. Check which path your code is on.

### ⚠️ `.claude/skills/question-authoring-worker/` is READ AT RUNTIME

`loadMethodPack()` in `src/services/authoring_worker.ts` reads these Markdown files
**off disk at call time** and composes them into the AI's system prompt:

```
SKILL.md                            ← the worker brief
conceptual-question-kinds.md        ← the full question palette
{board}-{subject}-difficulty-dials.md  ← selected per board+subject
```

Consequences a new dev will not guess:

- **Editing these Markdown files changes production AI behaviour.** They are not
  documentation. They are code.
- **They must be deployed with the app.** Excluding `.claude/` from a deploy leaves
  prod running new code against the old method pack — a mismatch that produces
  subtly wrong output with no error anywhere.
- Changing them changes the worker's session fingerprint, which invalidates resume.

### `ai_call_log` is the forensics table

Every AI call is logged with full prompt in/out, tokens, thinking tokens, latency,
finish reason, and error fields. It has **no RLS** (deliberately — it's evidence,
not tenant data) and attribution is `ON DELETE SET NULL`, so deleting a user keeps
the forensics and drops the name.

🔑 **`ok = true` means the vendor returned, NOT that the operation succeeded.** A
response can parse-fail, validate-fail, or throw downstream and the log row still
says `ok=t`. When investigating "it didn't work but there are no errors", the log is
the wrong place to stop — read the application logs too.

---

## 10. Boundaries — what NOT to do unasked

This repo deploys straight to production, serving real families. Therefore:

| Action | Rule |
|---|---|
| `git commit` | **Only when explicitly asked.** Build, verify, report, then wait. |
| `git push` | Same. Never bundled into "and I committed it for you." |
| Deploy | **Never** on your own initiative. A green build is not consent to ship. |
| Editing prod data | Never without an explicit, specific instruction. |
| Destructive scripts | Read what it deletes before you run it. Dry-run *with output*. |

A change sitting uncommitted in the working tree across a session is **normal and
by design** here, not a problem to tidy up.

### If you must run a destructive command

Make the dry run *prove* it ran. `rsync -azn` with no `-i`/`-v` **prints nothing** —
which is indistinguishable from "nothing will be deleted." That exact trap survived
five deploys. Use `-azni`.

> **A check that cannot visibly fail is not a check.**

Generalise it: any verification step that produces the same output whether it worked
or not is training you to ignore it. Build the control in.

### Never build a redactor out of the secret

Piping a secret into a regex to hide it (`perl -pe "s/\Q$PW\E/…"`) can fail *to
compile on the secret itself* and print it. Most tooling here already masks its own
connection strings — `db:migrate` does. Don't add your own.

---

## 11. Tooling conventions

- **`bun`, never `npm`/`yarn`/`pnpm`.** Check the lockfile if unsure.
- **Edit source with a real editor / the Edit tool — never `sed -i` or `awk`.**
  Stream editors have silently mangled files here. The failure is not local to the
  line you targeted.
- Routers stay thin. Logic goes in `src/services/`.
- `src/trpc/router.ts` is ~124KB — **grep it, don't read it whole.**
- Comments in this codebase carry *reasons*, often citing the incident that caused
  the code to look the way it does. Match that density when you add code. If you're
  about to write a line whose shape is non-obvious, write down why.

---

## 12. Where the rest of the documentation lives

**This repo is pure code.** The product spec, schema rationale, decision log, and a
long-running session journal live outside it, on the maintainer's machine:

```
/Users/mab/Desktop/claude/projects/nadi/rewrite/
  polaris-coverage-map.md   PRD / HLD + gap register
  spine-schema.md           LLD — the one-way-door schema decisions
  decisions.md              consolidated decision log
  build-state.md            session journal + resume pointer
```

🔴 **Those paths will not exist on your machine.** If you need the reasoning behind
a schema shape or a product rule, **ask the maintainer** rather than inferring it
from the code and proceeding. Several structures here look redundant and are not.

What *is* in-repo and authoritative for you:

- `packages/kernel/src/schema.ts` — the schema, heavily commented with rationale
- `scripts/probe_*.ts` headers — the behavioural spec, incident by incident
- this file + `docs/BUILD-PRINCIPLES.md`

---

## 13. First change checklist

```
[ ] docker compose up -d, then all FOUR processes running (§2)
[ ] bun run db:migrate — clean
[ ] Found the existing pattern before inventing one (grep a sibling service)
[ ] Scoped every DB read/write through withBoard (§4)
[ ] Schema touched? → TENANT_SCOPED_TABLES updated, RLS verified in pg_class (§5)
[ ] Migration generated? → BOTH files staged (§5)
[ ] Wrote/updated a probe — and broke the fix on purpose to prove it reds (§6)
[ ] Ran sibling probes (§6)
[ ] New route? → real restart, 401 + 404 control over HTTP (§7)
[ ] typecheck BE + typecheck FE (from frontend/) + FE build, all exit 0 (§8)
[ ] Opened it in a browser — or said plainly that I did not (§8)
[ ] Did NOT commit, push, or deploy unless asked (§10)
```
