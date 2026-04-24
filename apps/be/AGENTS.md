# Patram BE — Agent Guide

This file is the orientation document for any agent (or human) opening [apps/be/](./). Read it before touching code. Read the files in `Start here` if you need deeper context.

## Start here

- Design spec (source of truth for data model and API surface): [docs/superpowers/specs/2026-04-24-patram-sections-schema-design.md](../../docs/superpowers/specs/2026-04-24-patram-sections-schema-design.md)
- Implementation plan (how this BE was built, step by step): [docs/superpowers/plans/2026-04-24-patram-sections-persistence.md](../../docs/superpowers/plans/2026-04-24-patram-sections-persistence.md)
- Root toolchain rules (Vite+ / `vp` CLI): [../../AGENTS.md](../../AGENTS.md) and [../../CLAUDE.md](../../CLAUDE.md)
- Local setup (onboarding flow): [README.md](./README.md)

## What this is

A Hono app on Cloudflare Workers (wrangler) that persists Patram documents as an ordered list of **sections**. Sections — not whole documents — are the unit of editing, versioning, hashing, embedding, and agent mutation. Documents own metadata (title, emoji, status, frontmatter) only.

## Runtime

- **Hono** on **Cloudflare Workers** (`wrangler dev`).
- `nodejs_compat` is enabled so we can use `postgres` (postgres.js) and Node `Buffer`.
- `DATABASE_URL` and `BETTER_AUTH_SECRET` are runtime secrets — they live in `.dev.vars` locally (gitignored) and in Wrangler secrets in prod.

## Stack

- **Hono** for routing, with `hc<AppType>()` as the typed RPC client the SPA consumes.
- **Drizzle ORM** + **postgres.js** against a remote **Planetscale Postgres**. Schema under [src/db/schema/](./src/db/schema/); drizzle-kit migrations under [src/db/migrations/](./src/db/migrations/).
- **BetterAuth** for email+password auth, with a Drizzle adapter sharing our DB. Tables: `user`, `session`, `account`, `verification` (singular, unquoted).
- **Zod v4** for request validation (via `@hono/zod-validator`). Note: `z.record(z.string(), z.unknown())` — v4 requires both args; `z.url()` is a top-level method, not `z.string().url()`.
- **Vitest** via `vite-plus/test`. Tests hit the real remote PG — there are no DB mocks. Integration test harness: [src/test/harness.ts](./src/test/harness.ts).

## Foundational invariants (do not break these)

1. **Sections own content; documents own metadata.** `documents` has no `contentJson`. A document always has at least one section (create auto-inserts one).
2. **Every section write goes through [src/services/section-write.ts](./src/services/section-write.ts).** Never UPDATE `sections` directly from a route. The service runs the derivation pipeline (canonicalize → `contentText` → SHA-256 → link extraction) inside a single transaction and enforces optimistic concurrency.
3. **Derived fields are server-owned.** `contentText`, `contentTsv`, `contentHash`, `version`, and `section_links` rows are never accepted from the client. Zod schemas exclude them. `contentTsv` is a Postgres generated column; PG maintains it.
4. **Optimistic locking on sections.** `PATCH /sections/:id` requires `expectedVersion`. Mismatch → `409 version_conflict` with the current version in the response body. The service re-fetches the live version on belt-and-braces failure so the client never sees a stale number.
5. **Workspace isolation is enforced by `requireSession` and by route-level workspace joins.** Cross-workspace access returns **404** (never 403) to avoid leaking existence. `section_links` targets that resolve to a foreign-workspace document are silently dropped by `filterLinksToWorkspace`.
6. **Manual versioning only.** `section_versions` rows are created only by `POST /sections/:id/versions`. There is no auto-snapshot. `sections.version` (optimistic-lock counter) and `section_versions.versionNumber` (snapshot counter) are independent — both start at 1 and diverge immediately.
7. **Auth users are `text`, not FK.** All user-id-bearing columns (`createdBy`, `updatedBy`, `changedBy`, `authorId`, `resolvedBy`, `createdByAgent`) are plain `text`. BetterAuth uses text ids; we don't FK into its table.
8. **BetterAuth post-signup hook creates a workspace + owner membership atomically.** See [src/auth.ts](./src/auth.ts). Every signed-in user therefore has exactly one workspace in v1.

## Directory map

```
src/
├── index.ts                # Hono app entry. Mounts all routers. Exports AppType.
├── env.ts                  # Zod-validated env parser.
├── auth.ts                 # createAuth(db, opts) -> BetterAuth instance.
├── middleware/
│   └── auth.ts             # requireSession, requireWrite, ensureDocumentInWorkspace, AuthEnv type.
├── db/
│   ├── client.ts           # createDb(url) -> Drizzle+postgres.js client.
│   ├── schema/             # One file per logical group; all re-exported via index.ts.
│   │   ├── enums.ts
│   │   ├── workspaces.ts   # workspaces + workspace_members
│   │   ├── documents.ts
│   │   ├── sections.ts     # central table, generated tsvector, GIN index
│   │   ├── section-versions.ts
│   │   ├── section-links.ts
│   │   ├── comments.ts     # comment_threads + comments
│   │   ├── ai-suggestions.ts   # stub (no routes)
│   │   └── relationships.ts    # stub (no routes)
│   ├── auth-schema.ts      # BetterAuth-generated tables (user, session, account, verification)
│   └── migrations/         # drizzle-kit output — 0000_* (app schema), 0001_* (better-auth)
├── lib/
│   ├── content/
│   │   ├── canonicalize.ts # deterministic JSON stringify
│   │   ├── hash.ts         # SHA-256 via crypto.subtle
│   │   ├── extract-text.ts # ProseMirror tree -> plain text
│   │   └── extract-links.ts# docLink marks -> {docId, sectionId?}[]
│   └── order-key.ts        # fractional-indexing wrappers
├── services/
│   └── section-write.ts    # createSection, updateSection, VersionConflictError
├── routes/
│   ├── me.ts               # GET /me
│   ├── documents.ts        # CRUD; auto-creates one section on POST
│   ├── sections.ts         # CRUD + version snapshot routes
│   ├── comments.ts         # threads + comments, author-only edit/delete
│   └── dev.ts              # POST /dev/seed, gated on DEV_SEED
└── test/
    ├── harness.ts          # getTestDb, truncateAll, closeTestDb
    └── harness.test.ts
```

## API surface cheat-sheet

All routes require an authenticated session except `/health` and `/auth/*`. Cross-workspace access → 404.

| Verb   | Path                         | Notes                                                                     |
| ------ | ---------------------------- | ------------------------------------------------------------------------- | ----------- |
| GET    | `/health`                    | `{ ok: true }`                                                            |
| all    | `/auth/*`                    | BetterAuth handler. Email+password, auto-sign-in.                         |
| GET    | `/me`                        | `{ user: { id }, workspace, role }`                                       |
| GET    | `/documents`                 | List for workspace; `?status=`, `?parentId=<uuid>                         | null`       |
| POST   | `/documents`                 | Auto-inserts one initial empty section. Returns `{ document, sections }`. |
| GET    | `/documents/:id`             | `{ document, sections[] }` (sections sorted by `orderKey`)                |
| PATCH  | `/documents/:id`             | Body includes `expectedUpdatedAt` (ISO) → 409 on mismatch                 |
| DELETE | `/documents/:id`             | Cascades                                                                  |
| POST   | `/documents/:docId/sections` | `orderKey` optional (auto-append if missing)                              |
| PATCH  | `/sections/:id`              | Requires `expectedVersion` → 409 on mismatch                              |
| DELETE | `/sections/:id`              | Cascades                                                                  |
| POST   | `/sections/:id/versions`     | Manual snapshot. Does not mutate `sections.version`.                      |
| GET    | `/sections/:id/versions`     | `versionNumber DESC`                                                      |
| GET    | `/sections/:id/versions/:n`  | Single snapshot                                                           |
| POST   | `/sections/:id/threads`      | Thread + first comment, one tx                                            |
| GET    | `/sections/:id/threads`      | With `firstComment` + `commentCount`                                      |
| PATCH  | `/threads/:id`               | `status: 'open'                                                           | 'resolved'` |
| GET    | `/threads/:id/comments`      | Oldest-first                                                              |
| POST   | `/threads/:id/comments`      | Append                                                                    |
| PATCH  | `/comments/:id`              | Author-only; sets `editedAt`                                              |
| DELETE | `/comments/:id`              | Author-only; cascades the thread if last comment                          |
| POST   | `/dev/seed`                  | Idempotent per workspace; gated on `DEV_SEED`                             |

## How to add a new table

1. Write `src/db/schema/<name>.ts` with a `pgTable` and indexes. Use `uuid("id").primaryKey().defaultRandom()` for PKs.
2. Re-export from `src/db/schema/index.ts`.
3. `pnpm db:generate` — check the emitted SQL under `src/db/migrations/`.
4. `pnpm db:migrate` — apply to the remote DB.
5. If the new table needs truncation in tests, add it to `truncateAll` in [src/test/harness.ts](./src/test/harness.ts). Keep BetterAuth tables out of the truncate list.

## How to add a new route

1. Put the route module under [src/routes/](./src/routes/). Type it with `Hono<AuthEnv>`.
2. Validate input with `zValidator("json" | "query" | "param", zodSchema)`.
3. Read `c.get("db")` and `c.get("auth")` — both are set by `requireSession`. Do NOT construct your own Db/auth.
4. For any route that takes a `documentId` or `sectionId`, join through to `workspace_members`/`documents` to verify ownership — return 404 if the caller's workspace doesn't own the row.
5. Write a test in `src/routes/<name>.test.ts`. Build a minimal `Hono<AuthEnv>` app in the test that stubs the middleware with a preset `{ db, auth }` context. Seed a workspace + membership in `beforeEach` and use the real DB.
6. Mount the router from [src/index.ts](./src/index.ts) under the universal auth gate.

## How to run / test

- Local dev: `vp run be#dev` (from repo root) or `pnpm dev` (from `apps/be/`).
- Full test suite: `pnpm test` (from `apps/be/`). Runs sequentially against the remote DB — see [vitest.config.ts](./vitest.config.ts). Parallel execution deadlocks on the shared DB.
- Migrations: `pnpm db:generate` then `pnpm db:migrate`. Config loads `DATABASE_URL` from `.dev.vars` via `dotenv`.
- Deploy: `pnpm deploy`.

## Known pitfalls / tech debt

- **`PgDatabase<any, any, any>` casts.** `createSection`/`updateSection` are typed as taking `Db`, but routes often need to call them inside `db.transaction(tx => ...)`. The current fix is a triple cast (`tx as unknown as PgDatabase<any, any, any> as any`). Functional but ugly. Cleanest fix: widen the service parameter to the common supertype directly. Worth a follow-up pass.
- **Test serialization.** 15 test files share one remote DB. Vitest runs them sequentially (`fileParallelism: false`, `maxWorkers: 1`). Parallelism would require per-test-schema isolation or a DB pool.
- **No schema FK from our user-id columns to `user.id`.** Intentional — BetterAuth owns its migration and using text avoids a cross-migration ordering constraint. If we ever need referential integrity for audit, add it with an additive migration.
- **`z.record(z.string(), z.unknown())` is Zod v4 shape.** If you see `z.record(z.unknown())` anywhere, that's a bug — fix it.
- **`contentTsv` is a generated column.** Do NOT write to it, including in INSERTs. Drizzle's typed insert excludes it; keep it that way.
- **Secrets posture.** `apps/be/.dev.vars` must stay gitignored. Never print its contents, never commit it, never include its values in logs. Production secrets go through `wrangler secret put`.

## Stubs (schema only, no routes yet)

- `ai_suggestions` — for agent-authored suggestion proposals tied to a specific `sectionVersionAtCreation` anchor. Routes not wired; table exists.
- `relationships` — for explicit doc-level relationships (`related`, `supersedes`, …). Routes not wired; table exists. Separate from `section_links`, which is derived from inline `docLink` marks on save.

## What's next (not in this BE yet)

- SPA rewire: `apps/fe` currently uses in-memory Zustand with seed docs. The follow-up spec replaces that with Hono-RPC + React Query backed by this BE. See the spec's §10.
- Cloudflare AI Search embedding pipeline: `sections.content_hash` is the intended signal. No worker yet.
- Agent-authored writes: the `ai_suggestions` table is ready; nothing calls into it.
