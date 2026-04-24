# patram3-be

Hono on Cloudflare Workers. Backend for Patram.

## Prerequisites

- Vite+ (`vp`) installed globally — this repo uses `vp` in place of `pnpm`/`npm` for all dependency and script operations.
- A reachable Postgres instance. We do not ship a local `docker-compose.yml` — the project uses a remote managed Postgres (Planetscale, Neon, Supabase — anything Postgres-compatible). Obtain a connection URL from the project owner or provision your own.

## Local setup

1. Install deps from the repo root: `vp install`.
2. Create `apps/be/.dev.vars` (gitignored):
   ```
   DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=verify-full
   BETTER_AUTH_SECRET=<at-least-32-random-chars>
   BETTER_AUTH_URL=http://localhost:8787
   ```
3. Generate and apply the schema:
   ```
   vp run be#db:generate
   vp run be#db:migrate
   ```
4. Start the worker: `vp run be#dev`.

## Scripts

- `dev` — run the worker locally via `wrangler dev`.
- `test` — run the Vitest suite (reads `DATABASE_URL` from env or `.dev.vars`).
- `db:generate` — generate a new Drizzle migration from the schema.
- `db:migrate` — apply pending migrations to `DATABASE_URL`.
- `db:push` — push schema directly without a migration (dev only).
- `db:studio` — open Drizzle Studio.
- `deploy` — `wrangler deploy --minify` to Cloudflare.

## Production secrets

`DATABASE_URL` and `BETTER_AUTH_SECRET` are **not** declared in `wrangler.jsonc` `vars`. In production, set them via `wrangler secret put DATABASE_URL` and `wrangler secret put BETTER_AUTH_SECRET`.
