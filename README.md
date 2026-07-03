# b2c-rewrite

Greenfield, multi-tenant rebuild of the student-facing b2c exam-prep app
(TS/Bun · Hono · tRPC · Drizzle · Postgres + RLS · Redis/BullMQ · React/Vite).

**This repo is pure code.** All product/decision/journal docs live in
`/Users/mab/Desktop/claude/projects/nadi/rewrite/` (resume with `/nadi-b2c`):

| Doc | Role |
|---|---|
| `polaris-coverage-map.md` | PRD / HLD + Gap Register (G1–G10, PF1–3) |
| `spine-schema.md` | LLD — the one-way-door schema (forks F1–F5) |
| `impl-plan-walking-skeleton.md` | Slice plan S0→S4 (D-WS1–5) |
| `decisions.md` | Consolidated decision log |
| `build-state.md` | Session journal + resume pointer |

## Local dev

```bash
docker compose up -d          # postgres :5435, redis :6381
bun install
bun run db:generate           # drizzle table DDL from packages/kernel/src/schema.ts
bun run db:migrate            # apply tables + create app role + RLS policies
bun run probe:boot            # S0 gate — proves RLS isolation
bun run dev                   # backend :3010
cd frontend && bun install && bun run dev   # frontend :5174
```

Ports are offset (PG 5435 / Redis 6381 / BE 3010 / FE 5174) so this stack
coexists with Starkhorn and kinnectfi on one machine.

## Tenancy / RLS

`packages/kernel/src/schema.ts` is the shared spine. Tables carrying `board_id`
(see `TENANT_SCOPED_TABLES`) get Postgres row-level security. The app connects
as the non-superuser role `b2c_app` so RLS binds; migrations run as the owner
`b2c`. Scope a unit of work with `withBoard(boardId, tx => …)`.
