# Patram Sections Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Drizzle schema, Hono (Cloudflare Workers) REST surface, BetterAuth integration, and server-side content-derivation pipeline that make sections the unit of persistence for Patram, per [`docs/superpowers/specs/2026-04-24-patram-sections-schema-design.md`](../specs/2026-04-24-patram-sections-schema-design.md).

**Architecture:** All server logic lives in `apps/be` (Hono on Cloudflare Workers). Drizzle + postgres.js drives Postgres (Planetscale PG). BetterAuth owns sessions/users. Content derivation (canonicalization, SHA-256 hash, plain-text extraction, link extraction) runs inside a single DB transaction on every section write; client never supplies derived fields. Optimistic concurrency on sections via a `version` counter.

**Tech Stack:** Hono · Cloudflare Workers (wrangler) · Drizzle ORM · postgres.js · drizzle-kit · BetterAuth · Zod · fractional-indexing · Vitest (via `vite-plus/test`).

**Reading order for the executor:**

1. The spec (link above).
2. The existing BE entry: `apps/be/src/index.ts`.
3. The existing wrangler config: `apps/be/wrangler.jsonc`.
4. The existing root config: `pnpm-workspace.yaml`, `vite.config.ts`.

**Rules the executor MUST follow:**

- Use `vp add <pkg>` / `vp add -D <pkg>` inside `apps/be/` (or the workspace root with a filter) for all dependency installs. Never `pnpm add` directly.
- Run tests with `vp test`. Import test utilities from `vite-plus/test`, never from `vitest`.
- Run `vp check` before every commit. The repo's staged hook will also run it.
- Use `ctx7` (per the user's global rules) to verify the **current** API for Drizzle, BetterAuth, Hono, drizzle-kit, and postgres.js before coding each task. Pin versions at the versions `ctx7` returns as current/stable.
- Commits: Conventional Commits style (`feat(be): …`, `test(be): …`, etc.). One task = one commit unless a task explicitly says otherwise.
- Postgres is the target. The executor must have a reachable `DATABASE_URL` for tests (docker-compose `postgres:16` locally; CI uses a service). The plan provides a `docker-compose.yml` in Task 1.

---

## File Structure

Created / modified under `apps/be/`:

- `wrangler.jsonc` — enable `nodejs_compat`, add `DATABASE_URL` var stub, add `BETTER_AUTH_SECRET` var stub.
- `.env.example` — document local env vars.
- `docker-compose.yml` — local Postgres 16 for tests and dev.
- `drizzle.config.ts` — drizzle-kit config.
- `package.json` — add scripts `db:generate`, `db:migrate`, `db:push`, `db:studio`, `test`, and deps.
- `src/env.ts` — typed env accessor.
- `src/db/client.ts` — Drizzle + postgres.js factory.
- `src/db/schema/index.ts` — re-exports.
- `src/db/schema/enums.ts` — pg enums.
- `src/db/schema/workspaces.ts` — `workspaces`, `workspace_members`.
- `src/db/schema/documents.ts` — `documents`.
- `src/db/schema/sections.ts` — `sections` (incl. generated tsvector column).
- `src/db/schema/section-versions.ts`
- `src/db/schema/section-links.ts`
- `src/db/schema/comments.ts` — `comment_threads`, `comments`.
- `src/db/schema/ai-suggestions.ts` — stub.
- `src/db/schema/relationships.ts` — stub.
- `src/db/migrations/*` — drizzle-kit output.
- `src/auth.ts` — BetterAuth instance + post-signup hook.
- `src/middleware/auth.ts` — session + workspace-membership middleware.
- `src/lib/content/canonicalize.ts`
- `src/lib/content/hash.ts`
- `src/lib/content/extract-text.ts`
- `src/lib/content/extract-links.ts`
- `src/lib/order-key.ts` — fractional-indexing wrapper.
- `src/services/section-write.ts` — transactional write orchestration.
- `src/routes/me.ts`
- `src/routes/documents.ts`
- `src/routes/sections.ts`
- `src/routes/comments.ts`
- `src/routes/dev.ts`
- `src/index.ts` — assemble routes, export `AppType`.
- `src/lib/content/*.test.ts`, `src/services/*.test.ts`, `src/routes/*.test.ts`, `src/test/harness.ts` — tests.

---

## Task 1: Install server-side dependencies and set up local Postgres

**Files:**

- Create: `apps/be/docker-compose.yml`
- Create: `apps/be/.env.example`
- Modify: `apps/be/package.json`
- Modify: `apps/be/wrangler.jsonc`

- [ ] **Step 1: Use ctx7 to confirm current API and pin versions.**

Run (from repo root):

```bash
npx ctx7@latest library drizzle-orm "Postgres + Cloudflare Workers + postgres.js"
npx ctx7@latest library better-auth "Hono + Drizzle adapter + Cloudflare Workers"
npx ctx7@latest library hono "RPC client hc + middleware patterns"
npx ctx7@latest library drizzle-kit "generate migrations postgres"
```

Record the resolved `/org/project` IDs and then:

```bash
npx ctx7@latest docs <drizzle-id> "postgres-js driver setup with schema directory"
npx ctx7@latest docs <better-auth-id> "drizzle adapter + hono mount + email password + hooks"
npx ctx7@latest docs <hono-id> "hc RPC client with zod middleware"
```

Use the returned examples as the source of truth for the code in later tasks. Do **not** rely on memory for Drizzle/BetterAuth APIs.

- [ ] **Step 2: Add runtime dependencies via `vp`.**

Run from `apps/be/`:

```bash
vp add drizzle-orm postgres better-auth zod fractional-indexing nanoid
```

- [ ] **Step 3: Add dev dependencies via `vp`.**

Run from `apps/be/`:

```bash
vp add -D drizzle-kit @types/node
```

- [ ] **Step 4: Create `apps/be/docker-compose.yml`.**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: patram-pg
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: patram
      POSTGRES_PASSWORD: patram
      POSTGRES_DB: patram
    volumes:
      - patram-pg:/var/lib/postgresql/data

volumes:
  patram-pg:
```

- [ ] **Step 5: Create `apps/be/.env.example`.**

```
DATABASE_URL=postgres://patram:patram@localhost:5433/patram
BETTER_AUTH_SECRET=dev-secret-change-me-0123456789abcdef
BETTER_AUTH_URL=http://localhost:8787
DEV_SEED=1
```

- [ ] **Step 6: Update `apps/be/wrangler.jsonc`.**

Uncomment `compatibility_flags` to enable `nodejs_compat`. Add vars for local dev. Final file:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "patram3-be",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-23",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "BETTER_AUTH_URL": "http://localhost:8787",
    "DEV_SEED": "1",
  },
}
```

(`DATABASE_URL` and `BETTER_AUTH_SECRET` stay out of `vars` — they will be set via `wrangler secret put` in prod and via `.dev.vars` locally.)

- [ ] **Step 7: Create `apps/be/.dev.vars` (git-ignored).**

```
DATABASE_URL=postgres://patram:patram@localhost:5433/patram
BETTER_AUTH_SECRET=dev-secret-change-me-0123456789abcdef
```

Add `.dev.vars` to `.gitignore` if not already there (check `apps/be/.gitignore` and root `.gitignore`; add it to `apps/be/.gitignore`).

- [ ] **Step 8: Add scripts to `apps/be/package.json`.**

Merge these into the existing `scripts` object:

```json
{
  "db:generate": "vp exec drizzle-kit generate",
  "db:migrate": "vp exec drizzle-kit migrate",
  "db:push": "vp exec drizzle-kit push",
  "db:studio": "vp exec drizzle-kit studio",
  "test": "vp test run",
  "db:up": "docker compose up -d postgres",
  "db:down": "docker compose down"
}
```

- [ ] **Step 9: Bring up Postgres and smoke-test it.**

```bash
cd apps/be && pnpm db:up && sleep 2 && docker exec patram-pg psql -U patram -d patram -c "select 1;"
```

Expected output: `?column?` column with value `1`. If it fails, fix before moving on.

- [ ] **Step 10: Commit.**

```bash
git add apps/be/docker-compose.yml apps/be/.env.example apps/be/.gitignore apps/be/package.json apps/be/wrangler.jsonc apps/be/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "chore(be): add drizzle, better-auth, postgres deps and local db"
```

---

## Task 2: Typed env and Drizzle client

**Files:**

- Create: `apps/be/src/env.ts`
- Create: `apps/be/src/db/client.ts`
- Create: `apps/be/src/env.test.ts`

- [ ] **Step 1: Write the failing test.**

`apps/be/src/env.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("returns typed env when all required vars are present", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@host:5432/db",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://localhost:8787",
      DEV_SEED: "1",
    });
    expect(env.DATABASE_URL).toBe("postgres://u:p@host:5432/db");
    expect(env.DEV_SEED).toBe(true);
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() =>
      parseEnv({
        BETTER_AUTH_SECRET: "x".repeat(32),
        BETTER_AUTH_URL: "http://x",
      } as unknown as Record<string, string>),
    ).toThrow();
  });

  it("defaults DEV_SEED to false when absent", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@host:5432/db",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://x",
    });
    expect(env.DEV_SEED).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run from `apps/be/`:

```bash
vp test run src/env.test.ts
```

Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 3: Implement `apps/be/src/env.ts`.**

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  DEV_SEED: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false"), z.undefined()])
    .transform((v) => v === "1" || v === "true")
    .default("0" as const),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return envSchema.parse(raw);
}
```

- [ ] **Step 4: Run test to verify it passes.**

```bash
vp test run src/env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement `apps/be/src/db/client.ts`.**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 1, // Workers connection model: one connection per request
    prepare: false,
  });
  return drizzle(client, { schema });
}
```

_Note:_ `./schema` does not exist yet. Create a placeholder `apps/be/src/db/schema/index.ts` with `export {};` so the import resolves, then commit. Later tasks populate it.

- [ ] **Step 6: Create placeholder `apps/be/src/db/schema/index.ts`.**

```ts
export {};
```

- [ ] **Step 7: Type-check.**

```bash
vp check
```

Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add apps/be/src/env.ts apps/be/src/env.test.ts apps/be/src/db/client.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add typed env and drizzle client factory"
```

---

## Task 3: Enums

**Files:**

- Modify: `apps/be/src/db/schema/index.ts`
- Create: `apps/be/src/db/schema/enums.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/enums.ts`.**

```ts
import { pgEnum } from "drizzle-orm/pg-core";

export const workspaceRole = pgEnum("workspace_role", ["owner", "editor", "viewer"]);
export const docType = pgEnum("doc_type", ["prd", "strategy", "spec", "rfc", "other"]);
export const docStatus = pgEnum("doc_status", ["draft", "review", "published", "archived"]);
export const sectionKind = pgEnum("section_kind", [
  "prose",
  "list",
  "table",
  "code",
  "callout",
  "embed",
]);
export const changedByType = pgEnum("changed_by_type", ["user", "agent"]);
export const commentThreadStatus = pgEnum("comment_thread_status", ["open", "resolved"]);
export const suggestionType = pgEnum("suggestion_type", [
  "insert",
  "delete",
  "replace",
  "rewrite_section",
]);
export const suggestionStatus = pgEnum("suggestion_status", [
  "pending",
  "accepted",
  "rejected",
  "superseded",
]);
export const relationshipType = pgEnum("relationship_type", [
  "related",
  "supersedes",
  "superseded_by",
  "derived_from",
]);
```

- [ ] **Step 2: Re-export from `apps/be/src/db/schema/index.ts`.**

Replace contents:

```ts
export * from "./enums";
```

- [ ] **Step 3: Type-check.**

```bash
vp check
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/db/schema/enums.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add pg enums for workspaces, docs, sections, comments, stubs"
```

---

## Task 4: Workspaces + workspace_members tables

**Files:**

- Create: `apps/be/src/db/schema/workspaces.ts`
- Modify: `apps/be/src/db/schema/index.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/workspaces.ts`.**

```ts
import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaceRole } from "./enums";

export const workspaces = pgTable("workspaces", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // BetterAuth's user table uses text ids; verified via ctx7 before coding
    role: workspaceRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
  ],
);
```

_Note to executor:_ BetterAuth's default user id column type is `text` (cuid/uuid as string). Verify via `ctx7` docs call from Task 1 before coding. If BetterAuth's Drizzle adapter expects `uuid`, change both the FK column and the auth config to match — they must be consistent.

- [ ] **Step 2: Re-export from `apps/be/src/db/schema/index.ts`.**

```ts
export * from "./enums";
export * from "./workspaces";
```

- [ ] **Step 3: Type-check.**

```bash
vp check
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/db/schema/workspaces.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add workspaces and workspace_members tables"
```

---

## Task 5: Documents table

**Files:**

- Create: `apps/be/src/db/schema/documents.ts`
- Modify: `apps/be/src/db/schema/index.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/documents.ts`.**

```ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { docStatus, docType } from "./enums";
import { workspaces } from "./workspaces";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    emoji: text("emoji"),
    docType: docType("doc_type").notNull().default("other"),
    status: docStatus("status").notNull().default("draft"),
    parentDocumentId: uuid("parent_document_id").references((): AnyPgColumn => documents.id, {
      onDelete: "set null",
    }),
    frontmatter: jsonb("frontmatter")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_workspace_updated_idx").on(t.workspaceId, t.updatedAt.desc()),
    index("documents_workspace_status_idx").on(t.workspaceId, t.status),
    index("documents_parent_idx").on(t.parentDocumentId),
  ],
);
```

- [ ] **Step 2: Re-export.**

Append to `apps/be/src/db/schema/index.ts`:

```ts
export * from "./documents";
```

- [ ] **Step 3: Type-check.**

```bash
vp check
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/db/schema/documents.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add documents table"
```

---

## Task 6: Sections table (with generated tsvector column)

**Files:**

- Create: `apps/be/src/db/schema/sections.ts`
- Modify: `apps/be/src/db/schema/index.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/sections.ts`.**

```ts
import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sectionKind } from "./enums";
import { documents } from "./documents";

// Drizzle has no native tsvector; use customType. The column is server-generated.
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

// bytea for future Yjs
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
});

export const sections = pgTable(
  "sections",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    orderKey: text("order_key").notNull(),
    label: text("label"),
    kind: sectionKind("kind").notNull().default("prose"),
    contentJson: jsonb("content_json").notNull(),
    contentText: text("content_text").notNull().default(""),
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', content_text)`,
    ),
    contentHash: text("content_hash").notNull(),
    frontmatter: jsonb("frontmatter")
      .notNull()
      .default(sql`'{}'::jsonb`),
    version: integer("version").notNull().default(1),
    ydocState: bytea("ydoc_state"),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sections_doc_order_idx").on(t.documentId, t.orderKey),
    index("sections_content_hash_idx").on(t.contentHash),
    index("sections_tsv_gin").using("gin", t.contentTsv),
  ],
);
```

_Note:_ If the installed `drizzle-orm` version does not expose `generatedAlwaysAs` on `customType`, fall back to emitting the generated-column clause via `sql` inside a raw migration step after running `db:generate`. Verify API via `ctx7` first.

- [ ] **Step 2: Re-export.**

Append to `apps/be/src/db/schema/index.ts`:

```ts
export * from "./sections";
```

- [ ] **Step 3: Type-check.**

```bash
vp check
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/db/schema/sections.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add sections table with generated tsvector"
```

---

## Task 7: Section versions table

**Files:**

- Create: `apps/be/src/db/schema/section-versions.ts`
- Modify: `apps/be/src/db/schema/index.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/section-versions.ts`.**

```ts
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { changedByType } from "./enums";
import { sections } from "./sections";

export const sectionVersions = pgTable(
  "section_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    contentJson: jsonb("content_json").notNull(),
    contentText: text("content_text").notNull(),
    contentHash: text("content_hash").notNull(),
    label: text("label"),
    changeSummary: text("change_summary"),
    changedBy: text("changed_by").notNull(),
    changedByType: changedByType("changed_by_type").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("section_versions_section_number_idx").on(t.sectionId, t.versionNumber),
    index("section_versions_section_number_desc_idx").on(t.sectionId, t.versionNumber.desc()),
  ],
);
```

- [ ] **Step 2: Re-export.**

Append:

```ts
export * from "./section-versions";
```

- [ ] **Step 3: Type-check and commit.**

```bash
vp check
git add apps/be/src/db/schema/section-versions.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add section_versions table"
```

---

## Task 8: Section links table

**Files:**

- Create: `apps/be/src/db/schema/section-links.ts`
- Modify: `apps/be/src/db/schema/index.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/section-links.ts`.**

```ts
import { sql } from "drizzle-orm";
import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { sections } from "./sections";

export const sectionLinks = pgTable(
  "section_links",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sourceSectionId: uuid("source_section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    targetDocumentId: uuid("target_document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    targetSectionId: uuid("target_section_id").references(() => sections.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("section_links_src_doc_section_idx").on(
      t.sourceSectionId,
      t.targetDocumentId,
      t.targetSectionId,
    ),
    index("section_links_src_idx").on(t.sourceSectionId),
    index("section_links_target_idx").on(t.targetDocumentId, t.targetSectionId),
  ],
);
```

- [ ] **Step 2: Re-export.**

Append:

```ts
export * from "./section-links";
```

- [ ] **Step 3: Type-check and commit.**

```bash
vp check
git add apps/be/src/db/schema/section-links.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add section_links table"
```

---

## Task 9: Comment threads and comments

**Files:**

- Create: `apps/be/src/db/schema/comments.ts`
- Modify: `apps/be/src/db/schema/index.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/comments.ts`.**

```ts
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { commentThreadStatus } from "./enums";
import { sections } from "./sections";

export const commentThreads = pgTable(
  "comment_threads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    status: commentThreadStatus("status").notNull().default("open"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("comment_threads_section_status_idx").on(t.sectionId, t.status)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => commentThreads.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("comments_thread_created_idx").on(t.threadId, t.createdAt)],
);
```

- [ ] **Step 2: Re-export.**

Append:

```ts
export * from "./comments";
```

- [ ] **Step 3: Type-check and commit.**

```bash
vp check
git add apps/be/src/db/schema/comments.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add comment_threads and comments tables"
```

---

## Task 10: Stubs — ai_suggestions and relationships

**Files:**

- Create: `apps/be/src/db/schema/ai-suggestions.ts`
- Create: `apps/be/src/db/schema/relationships.ts`
- Modify: `apps/be/src/db/schema/index.ts`

- [ ] **Step 1: Implement `apps/be/src/db/schema/ai-suggestions.ts`.**

```ts
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { suggestionStatus, suggestionType } from "./enums";
import { sections } from "./sections";

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    sectionVersionAtCreation: integer("section_version_at_creation").notNull(),
    suggestionType: suggestionType("suggestion_type").notNull(),
    anchorFrom: integer("anchor_from").notNull(),
    anchorTo: integer("anchor_to").notNull(),
    anchorText: text("anchor_text").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    rationale: text("rationale"),
    status: suggestionStatus("status").notNull().default("pending"),
    createdByAgent: text("created_by_agent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("ai_suggestions_section_status_idx").on(t.sectionId, t.status)],
);
```

- [ ] **Step 2: Implement `apps/be/src/db/schema/relationships.ts`.**

```ts
import { sql } from "drizzle-orm";
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { relationshipType } from "./enums";

export const relationships = pgTable("relationships", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sourceDocumentId: uuid("source_document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  targetDocumentId: uuid("target_document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  relationshipType: relationshipType("relationship_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Re-export.**

Append to `apps/be/src/db/schema/index.ts`:

```ts
export * from "./ai-suggestions";
export * from "./relationships";
```

- [ ] **Step 4: Type-check and commit.**

```bash
vp check
git add apps/be/src/db/schema/ai-suggestions.ts apps/be/src/db/schema/relationships.ts apps/be/src/db/schema/index.ts
git commit -m "feat(be): add ai_suggestions and relationships stubs"
```

---

## Task 11: Drizzle-kit config and first migration

**Files:**

- Create: `apps/be/drizzle.config.ts`
- Create: `apps/be/src/db/migrations/*` (generated)

- [ ] **Step 1: Create `apps/be/drizzle.config.ts`.**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://patram:patram@localhost:5433/patram",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
```

- [ ] **Step 2: Generate the migration.**

```bash
cd apps/be && pnpm db:generate
```

Expected: a new folder `src/db/migrations/0000_*` containing `*.sql` and `meta/` entries. Inspect the generated SQL — confirm it contains:

- `CREATE TYPE` for each enum.
- `CREATE TABLE` for workspaces, workspace_members, documents, sections, section_versions, section_links, comment_threads, comments, ai_suggestions, relationships.
- The tsvector generated column on `sections` (if not present, add it via Step 3's manual SQL step).
- All indexes including the GIN index on `content_tsv`.

- [ ] **Step 3: If the generated migration missed the generated tsvector column, patch it manually.**

If `sections.content_tsv` is not in the generated SQL with `GENERATED ALWAYS AS (...) STORED`, open the generated `.sql` file and replace the `content_tsv` column definition with:

```sql
"content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', content_text)) STORED,
```

Also confirm the GIN index is present:

```sql
CREATE INDEX "sections_tsv_gin" ON "sections" USING gin ("content_tsv");
```

If not, append the statement at the bottom of the same file.

- [ ] **Step 4: Apply the migration to local Postgres.**

```bash
cd apps/be && pnpm db:up && pnpm db:migrate
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 5: Smoke-test the schema.**

```bash
docker exec patram-pg psql -U patram -d patram -c "\dt" -c "\d sections"
```

Expected: all 10 tables listed; `sections.content_tsv` column shown as `tsvector` with `GENERATED ALWAYS AS` clause.

- [ ] **Step 6: Commit.**

```bash
git add apps/be/drizzle.config.ts apps/be/src/db/migrations
git commit -m "feat(be): add drizzle-kit config and initial migration"
```

---

## Task 12: Content pipeline — canonicalize JSON

**Files:**

- Create: `apps/be/src/lib/content/canonicalize.ts`
- Create: `apps/be/src/lib/content/canonicalize.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vite-plus/test";
import { canonicalizeJson } from "./canonicalize";

describe("canonicalizeJson", () => {
  it("sorts object keys recursively", () => {
    const input = { b: 1, a: { z: true, y: [3, 2, 1] } };
    expect(canonicalizeJson(input)).toBe('{"a":{"y":[3,2,1],"z":true},"b":1}');
  });

  it("is stable across equivalent objects", () => {
    const a = { x: 1, y: { b: 2, a: 1 } };
    const b = { y: { a: 1, b: 2 }, x: 1 };
    expect(canonicalizeJson(a)).toBe(canonicalizeJson(b));
  });

  it("preserves array order (order is semantically meaningful in PM)", () => {
    expect(canonicalizeJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined values inside objects", () => {
    const input = { a: 1, b: undefined };
    expect(canonicalizeJson(input as unknown as Record<string, unknown>)).toBe('{"a":1}');
  });

  it("handles null", () => {
    expect(canonicalizeJson({ a: null })).toBe('{"a":null}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
cd apps/be && vp test run src/lib/content/canonicalize.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/be/src/lib/content/canonicalize.ts`.**

```ts
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] === undefined) continue;
    sorted[key] = sortValue(obj[key]);
  }
  return sorted;
}
```

- [ ] **Step 4: Run test to verify it passes.**

```bash
vp test run src/lib/content/canonicalize.test.ts
```

Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit.**

```bash
git add apps/be/src/lib/content/canonicalize.ts apps/be/src/lib/content/canonicalize.test.ts
git commit -m "feat(be): add canonical JSON serialization"
```

---

## Task 13: Content pipeline — SHA-256 hash

**Files:**

- Create: `apps/be/src/lib/content/hash.ts`
- Create: `apps/be/src/lib/content/hash.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vite-plus/test";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("produces the known sha256 of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces 64 hex chars", async () => {
    expect((await sha256Hex("patram")).length).toBe(64);
  });
});
```

- [ ] **Step 2: Run test — fails on missing module.**

```bash
vp test run src/lib/content/hash.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/be/src/lib/content/hash.ts`.**

```ts
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

_Note:_ `crypto.subtle` is available in both Cloudflare Workers and Node 22+ (via `globalThis.crypto`).

- [ ] **Step 4: Run test.**

```bash
vp test run src/lib/content/hash.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/be/src/lib/content/hash.ts apps/be/src/lib/content/hash.test.ts
git commit -m "feat(be): add sha256Hex helper"
```

---

## Task 14: Content pipeline — extract plain text

**Files:**

- Create: `apps/be/src/lib/content/extract-text.ts`
- Create: `apps/be/src/lib/content/extract-text.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vite-plus/test";
import { extractText } from "./extract-text";

describe("extractText", () => {
  it("returns empty string for an empty doc", () => {
    expect(extractText({ type: "doc", content: [] })).toBe("");
  });

  it("extracts paragraph text", () => {
    expect(
      extractText({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
      }),
    ).toBe("hello");
  });

  it("joins blocks with double newline", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "a" }] },
          { type: "paragraph", content: [{ type: "text", text: "b" }] },
        ],
      }),
    ).toBe("a\n\nb");
  });

  it("joins list items with single newline within a list, double between lists", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "y" }] }],
              },
            ],
          },
        ],
      }),
    ).toBe("x\ny");
  });

  it("handles nested callouts", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          {
            type: "callout",
            attrs: { emoji: "💡" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "idea" }] }],
          },
        ],
      }),
    ).toBe("idea");
  });

  it("handles table cells joined by newline", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "A1" }] }],
                  },
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "A2" }] }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe("A1\nA2");
  });
});
```

- [ ] **Step 2: Run test — fails.**

```bash
vp test run src/lib/content/extract-text.test.ts
```

- [ ] **Step 3: Implement `apps/be/src/lib/content/extract-text.ts`.**

```ts
type PMNode = {
  type: string;
  text?: string;
  content?: PMNode[];
};

const NEWLINE_JOIN = new Set(["listItem", "tableCell", "tableHeader", "tableRow"]);
const ATOMIC_TEXT = new Set(["hardBreak"]);

export function extractText(doc: unknown): string {
  const root = doc as PMNode;
  if (!root.content || root.content.length === 0) return "";
  return root.content.map(blockText).join("\n\n");
}

function blockText(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  if (ATOMIC_TEXT.has(node.type)) return "\n";
  if (!node.content) return "";

  const separator = NEWLINE_JOIN.has(node.type) ? "\n" : "";
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    return node.content.map(blockText).join("\n");
  }
  if (node.type === "table") {
    return node.content.map(blockText).join("\n");
  }
  if (node.type === "tableRow") {
    return node.content.map(blockText).join("\n");
  }
  if (node.type === "tableCell" || node.type === "tableHeader" || node.type === "listItem") {
    // children are block-level but within cell we collapse to single-newline-joined text
    return node.content.map(blockText).join(" ").trim();
  }
  // default: join inline children with "", block children with "\n\n"
  const isInline =
    node.type === "paragraph" || node.type === "heading" || node.type === "blockquote";
  if (isInline) {
    return node.content.map(blockText).join("");
  }
  return node.content.map(blockText).join(separator || "\n\n");
}
```

- [ ] **Step 4: Run test until PASS.**

```bash
vp test run src/lib/content/extract-text.test.ts
```

Expected: PASS all 6 cases. If a case fails, adjust the function and re-run.

- [ ] **Step 5: Commit.**

```bash
git add apps/be/src/lib/content/extract-text.ts apps/be/src/lib/content/extract-text.test.ts
git commit -m "feat(be): add prosemirror-to-plain-text extraction"
```

---

## Task 15: Content pipeline — extract link tuples

**Files:**

- Create: `apps/be/src/lib/content/extract-links.ts`
- Create: `apps/be/src/lib/content/extract-links.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vite-plus/test";
import { extractLinks } from "./extract-links";

describe("extractLinks", () => {
  it("returns empty for doc with no docLink marks", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
      }),
    ).toEqual([]);
  });

  it("extracts one docLink mark", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "see",
                marks: [{ type: "docLink", attrs: { docId: "d1", sectionId: "s1" } }],
              },
            ],
          },
        ],
      }),
    ).toEqual([{ targetDocumentId: "d1", targetSectionId: "s1" }]);
  });

  it("dedupes identical tuples", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "a", marks: [{ type: "docLink", attrs: { docId: "d1" } }] },
              { type: "text", text: "b", marks: [{ type: "docLink", attrs: { docId: "d1" } }] },
            ],
          },
        ],
      }),
    ).toEqual([{ targetDocumentId: "d1", targetSectionId: null }]);
  });

  it("keeps tuples with and without sectionId as distinct", () => {
    const out = extractLinks({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "docLink", attrs: { docId: "d1" } }] },
            {
              type: "text",
              text: "b",
              marks: [{ type: "docLink", attrs: { docId: "d1", sectionId: "s1" } }],
            },
          ],
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ targetDocumentId: "d1", targetSectionId: null });
    expect(out).toContainEqual({ targetDocumentId: "d1", targetSectionId: "s1" });
  });

  it("ignores docLink marks with no docId", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "a", marks: [{ type: "docLink", attrs: {} }] }],
          },
        ],
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — fails.**

```bash
vp test run src/lib/content/extract-links.test.ts
```

- [ ] **Step 3: Implement `apps/be/src/lib/content/extract-links.ts`.**

```ts
export type LinkTuple = {
  targetDocumentId: string;
  targetSectionId: string | null;
};

type PMMark = { type: string; attrs?: { docId?: string; sectionId?: string } };
type PMNode = {
  type: string;
  marks?: PMMark[];
  content?: PMNode[];
};

export function extractLinks(doc: unknown): LinkTuple[] {
  const seen = new Set<string>();
  const out: LinkTuple[] = [];
  walk(doc as PMNode, (node) => {
    for (const mark of node.marks ?? []) {
      if (mark.type !== "docLink") continue;
      const docId = mark.attrs?.docId;
      if (!docId) continue;
      const sectionId = mark.attrs?.sectionId ?? null;
      const key = `${docId}|${sectionId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ targetDocumentId: docId, targetSectionId: sectionId });
    }
  });
  return out;
}

function walk(node: PMNode, visit: (n: PMNode) => void) {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}
```

- [ ] **Step 4: Run test — PASS.**

```bash
vp test run src/lib/content/extract-links.test.ts
```

- [ ] **Step 5: Commit.**

```bash
git add apps/be/src/lib/content/extract-links.ts apps/be/src/lib/content/extract-links.test.ts
git commit -m "feat(be): add docLink extraction"
```

---

## Task 16: Order key helper

**Files:**

- Create: `apps/be/src/lib/order-key.ts`
- Create: `apps/be/src/lib/order-key.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vite-plus/test";
import { keyAfter, keyBefore, keyBetween } from "./order-key";

describe("order-key", () => {
  it("keyAfter produces a key greater than input", () => {
    const k = keyAfter(null);
    const k2 = keyAfter(k);
    expect(k2 > k).toBe(true);
  });

  it("keyBefore produces a key less than input", () => {
    const k = keyAfter(null);
    const k2 = keyBefore(k);
    expect(k2 < k).toBe(true);
  });

  it("keyBetween produces a key strictly between its bounds", () => {
    const a = keyAfter(null);
    const b = keyAfter(a);
    const mid = keyBetween(a, b);
    expect(mid > a && mid < b).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails.**

```bash
vp test run src/lib/order-key.test.ts
```

- [ ] **Step 3: Implement `apps/be/src/lib/order-key.ts`.**

```ts
import { generateKeyBetween } from "fractional-indexing";

export function keyAfter(prev: string | null): string {
  return generateKeyBetween(prev, null);
}

export function keyBefore(next: string): string {
  return generateKeyBetween(null, next);
}

export function keyBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next);
}
```

- [ ] **Step 4: Run — PASS.**

```bash
vp test run src/lib/order-key.test.ts
```

- [ ] **Step 5: Commit.**

```bash
git add apps/be/src/lib/order-key.ts apps/be/src/lib/order-key.test.ts
git commit -m "feat(be): add fractional order-key helpers"
```

---

## Task 17: Integration test harness

**Files:**

- Create: `apps/be/src/test/harness.ts`
- Create: `apps/be/vitest.config.ts` (if not present)

- [ ] **Step 1: Confirm test config. If `vitest.config.ts` is absent in `apps/be/`, create it.**

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
```

- [ ] **Step 2: Implement the harness.**

`apps/be/src/test/harness.ts`:

```ts
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: TestDb | null = null;
let cachedClient: ReturnType<typeof postgres> | null = null;

export async function getTestDb(): Promise<TestDb> {
  if (cachedDb) return cachedDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set for tests");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  cachedClient = client;
  cachedDb = db;
  return db;
}

export async function truncateAll(db: TestDb): Promise<void> {
  // Order matters due to FKs. Cascade on workspaces handles the rest.
  await db.execute(sql`
    truncate table
      section_links,
      section_versions,
      comments,
      comment_threads,
      ai_suggestions,
      sections,
      relationships,
      documents,
      workspace_members,
      workspaces
    restart identity cascade
  `);
}

export async function closeTestDb(): Promise<void> {
  if (cachedClient) await cachedClient.end();
  cachedClient = null;
  cachedDb = null;
}
```

- [ ] **Step 3: Add a sanity test.**

`apps/be/src/test/harness.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { closeTestDb, getTestDb, truncateAll } from "./harness";

describe("test harness", () => {
  beforeAll(async () => {
    const db = await getTestDb();
    await truncateAll(db);
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("connects and reports postgres version", async () => {
    const db = await getTestDb();
    const rows = await db.execute(sql`select version()`);
    expect(String(rows[0]?.version)).toContain("PostgreSQL");
  });
});
```

- [ ] **Step 4: Bring PG up and run the harness test.**

```bash
cd apps/be && pnpm db:up && sleep 2 && DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/test/harness.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/be/src/test/harness.ts apps/be/src/test/harness.test.ts apps/be/vitest.config.ts
git commit -m "test(be): add postgres integration test harness"
```

---

## Task 18: Section write service

**Files:**

- Create: `apps/be/src/services/section-write.ts`
- Create: `apps/be/src/services/section-write.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { and, eq } from "drizzle-orm";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";
import { documents, sections, sectionLinks, workspaces, workspaceMembers } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection, updateSection, VersionConflictError } from "./section-write";

let db: TestDb;
const USER = "user-a";
const OTHER_USER = "user-b";
let wsId: string;
let docId: string;

async function seed(): Promise<void> {
  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Test", slug: `t-${Date.now()}` })
    .returning();
  wsId = ws.id;
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: USER, role: "owner" });
  const [doc] = await db
    .insert(documents)
    .values({ workspaceId: ws.id, createdBy: USER, updatedBy: USER, title: "Doc" })
    .returning();
  docId = doc.id;
}

describe("section-write service", () => {
  beforeAll(async () => {
    db = await getTestDb();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("createSection sets derived fields and version=1", async () => {
    const section = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
      },
    });
    expect(section.version).toBe(1);
    expect(section.contentText).toBe("hello");
    expect(section.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("updateSection with correct expectedVersion bumps to 2 and updates text+hash", async () => {
    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
      },
    });
    const updated = await updateSection(db, {
      sectionId: created.id,
      expectedVersion: 1,
      userId: USER,
      patch: {
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }],
        },
      },
    });
    expect(updated.version).toBe(2);
    expect(updated.contentText).toBe("b");
    expect(updated.contentHash).not.toBe(created.contentHash);
  });

  it("updateSection throws VersionConflictError when version is stale", async () => {
    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: { type: "doc", content: [] },
    });
    await expect(
      updateSection(db, {
        sectionId: created.id,
        expectedVersion: 999,
        userId: USER,
        patch: { label: "x" },
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("rewrites section_links on each save", async () => {
    const [otherDoc] = await db
      .insert(documents)
      .values({ workspaceId: wsId, createdBy: USER, updatedBy: USER, title: "Other" })
      .returning();

    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "ref",
                marks: [{ type: "docLink", attrs: { docId: otherDoc.id } }],
              },
            ],
          },
        ],
      },
    });
    const linksAfterCreate = await db
      .select()
      .from(sectionLinks)
      .where(eq(sectionLinks.sourceSectionId, created.id));
    expect(linksAfterCreate).toHaveLength(1);
    expect(linksAfterCreate[0]?.targetDocumentId).toBe(otherDoc.id);

    await updateSection(db, {
      sectionId: created.id,
      expectedVersion: 1,
      userId: USER,
      patch: { contentJson: { type: "doc", content: [] } },
    });
    const linksAfterUpdate = await db
      .select()
      .from(sectionLinks)
      .where(eq(sectionLinks.sourceSectionId, created.id));
    expect(linksAfterUpdate).toHaveLength(0);
  });

  it("drops cross-workspace link targets silently", async () => {
    const [ws2] = await db
      .insert(workspaces)
      .values({ name: "Other WS", slug: `x-${Date.now()}` })
      .returning();
    await db.insert(workspaceMembers).values({
      workspaceId: ws2.id,
      userId: OTHER_USER,
      role: "owner",
    });
    const [foreignDoc] = await db
      .insert(documents)
      .values({
        workspaceId: ws2.id,
        createdBy: OTHER_USER,
        updatedBy: OTHER_USER,
        title: "Foreign",
      })
      .returning();

    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "docLink", attrs: { docId: foreignDoc.id } }],
              },
            ],
          },
        ],
      },
    });
    const links = await db
      .select()
      .from(sectionLinks)
      .where(eq(sectionLinks.sourceSectionId, created.id));
    expect(links).toHaveLength(0);
    // sanity: section still committed, just without the illegal link
    const refetched = await db.select().from(sections).where(eq(sections.id, created.id));
    expect(refetched).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — all cases fail (module not present).**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/services/section-write.test.ts
```

- [ ] **Step 3: Implement `apps/be/src/services/section-write.ts`.**

```ts
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, sections, sectionLinks, workspaces } from "../db/schema";
import { canonicalizeJson } from "../lib/content/canonicalize";
import { extractLinks, type LinkTuple } from "../lib/content/extract-links";
import { extractText } from "../lib/content/extract-text";
import { sha256Hex } from "../lib/content/hash";

export class VersionConflictError extends Error {
  currentVersion: number;
  constructor(currentVersion: number) {
    super("Version conflict");
    this.name = "VersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export type CreateSectionInput = {
  documentId: string;
  userId: string;
  orderKey: string;
  contentJson: unknown;
  label?: string | null;
  kind?: "prose" | "list" | "table" | "code" | "callout" | "embed";
  frontmatter?: Record<string, unknown>;
};

export type UpdateSectionInput = {
  sectionId: string;
  expectedVersion: number;
  userId: string;
  patch: {
    contentJson?: unknown;
    label?: string | null;
    kind?: "prose" | "list" | "table" | "code" | "callout" | "embed";
    frontmatter?: Record<string, unknown>;
    orderKey?: string;
  };
};

type Derived = {
  canonicalJson: unknown;
  contentText: string;
  contentHash: string;
  links: LinkTuple[];
};

async function derive(contentJson: unknown): Promise<Derived> {
  const canonical = canonicalizeJson(contentJson);
  const contentText = extractText(contentJson);
  const contentHash = await sha256Hex(canonical);
  const links = extractLinks(contentJson);
  return { canonicalJson: JSON.parse(canonical), contentText, contentHash, links };
}

async function filterLinksToWorkspace(
  tx: Db,
  workspaceId: string,
  links: LinkTuple[],
): Promise<LinkTuple[]> {
  if (links.length === 0) return [];
  const docIds = [...new Set(links.map((l) => l.targetDocumentId))];
  const rows = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(and(inArray(documents.id, docIds), eq(documents.workspaceId, workspaceId)));
  const allowed = new Set(rows.map((r) => r.id));
  return links.filter((l) => allowed.has(l.targetDocumentId));
}

export async function createSection(db: Db, input: CreateSectionInput) {
  const derived = await derive(input.contentJson);

  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select({ workspaceId: documents.workspaceId })
      .from(documents)
      .where(eq(documents.id, input.documentId));
    if (!doc) throw new Error("Document not found");

    const [inserted] = await tx
      .insert(sections)
      .values({
        documentId: input.documentId,
        orderKey: input.orderKey,
        label: input.label ?? null,
        kind: input.kind ?? "prose",
        contentJson: derived.canonicalJson,
        contentText: derived.contentText,
        contentHash: derived.contentHash,
        frontmatter: input.frontmatter ?? {},
        version: 1,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .returning();
    if (!inserted) throw new Error("Section insert failed");

    const allowed = await filterLinksToWorkspace(tx, doc.workspaceId, derived.links);
    if (allowed.length > 0) {
      await tx.insert(sectionLinks).values(
        allowed.map((l) => ({
          sourceSectionId: inserted.id,
          targetDocumentId: l.targetDocumentId,
          targetSectionId: l.targetSectionId,
        })),
      );
    }

    return inserted;
  });
}

export async function updateSection(db: Db, input: UpdateSectionInput) {
  const contentJson = input.patch.contentJson;
  const derived = contentJson !== undefined ? await derive(contentJson) : null;

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        version: sections.version,
        documentId: sections.documentId,
      })
      .from(sections)
      .where(eq(sections.id, input.sectionId));
    if (!current) throw new Error("Section not found");
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError(current.version);
    }
    const [doc] = await tx
      .select({ workspaceId: documents.workspaceId })
      .from(documents)
      .where(eq(documents.id, current.documentId));
    if (!doc) throw new Error("Document not found");

    const setPatch: Record<string, unknown> = {
      version: sql`${sections.version} + 1`,
      updatedBy: input.userId,
      updatedAt: sql`now()`,
    };
    if (input.patch.label !== undefined) setPatch.label = input.patch.label;
    if (input.patch.kind !== undefined) setPatch.kind = input.patch.kind;
    if (input.patch.frontmatter !== undefined) setPatch.frontmatter = input.patch.frontmatter;
    if (input.patch.orderKey !== undefined) setPatch.orderKey = input.patch.orderKey;
    if (derived) {
      setPatch.contentJson = derived.canonicalJson;
      setPatch.contentText = derived.contentText;
      setPatch.contentHash = derived.contentHash;
    }

    const [updated] = await tx
      .update(sections)
      .set(setPatch)
      .where(and(eq(sections.id, input.sectionId), eq(sections.version, input.expectedVersion)))
      .returning();
    if (!updated) throw new VersionConflictError(current.version);

    if (derived) {
      await tx.delete(sectionLinks).where(eq(sectionLinks.sourceSectionId, input.sectionId));
      const allowed = await filterLinksToWorkspace(tx, doc.workspaceId, derived.links);
      if (allowed.length > 0) {
        await tx.insert(sectionLinks).values(
          allowed.map((l) => ({
            sourceSectionId: input.sectionId,
            targetDocumentId: l.targetDocumentId,
            targetSectionId: l.targetSectionId,
          })),
        );
      }
    }

    return updated;
  });
}
```

- [ ] **Step 4: Run tests to PASS.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/services/section-write.test.ts
```

Expected: all 5 cases PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/be/src/services/section-write.ts apps/be/src/services/section-write.test.ts
git commit -m "feat(be): add transactional section create/update service"
```

---

## Task 19: BetterAuth setup and post-signup workspace hook

**Files:**

- Create: `apps/be/src/auth.ts`
- Create: `apps/be/src/auth.test.ts`

- [ ] **Step 1: Confirm BetterAuth API via ctx7.**

```bash
npx ctx7@latest docs <better-auth-id> "drizzle adapter hono handler post-signup hook create workspace"
```

Pay attention to:

- The exact adapter import path (`better-auth/adapters/drizzle` or similar).
- The hook configuration shape (`databaseHooks.user.create.before`/`after`).
- What tables BetterAuth expects (`user`, `session`, `account`, `verification`) and their id types.
- The Hono handler mount pattern.

Apply what `ctx7` returns; the code below is a starting scaffold that may need minor adjustments.

- [ ] **Step 2: Implement `apps/be/src/auth.ts`.**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { workspaceMembers, workspaces } from "./db/schema";

export type AuthInstance = ReturnType<typeof createAuth>;

export function createAuth(db: Db, opts: { secret: string; baseURL: string }) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: opts.secret,
    baseURL: opts.baseURL,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    databaseHooks: {
      user: {
        create: {
          async after(user) {
            await db.transaction(async (tx) => {
              const slug = await uniqueSlug(tx, user.email ?? `user-${user.id}`);
              const [ws] = await tx
                .insert(workspaces)
                .values({ name: `${slug}'s workspace`, slug })
                .returning();
              if (!ws) throw new Error("workspace insert failed");
              await tx.insert(workspaceMembers).values({
                workspaceId: ws.id,
                userId: user.id,
                role: "owner",
              });
            });
          },
        },
      },
    },
  });
}

async function uniqueSlug(tx: Db, seed: string): Promise<string> {
  const base =
    seed
      .split("@")[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "user";
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const rows = await tx.execute(sql`select 1 from workspaces where slug = ${candidate} limit 1`);
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
```

- [ ] **Step 3: Write a BetterAuth integration test.**

`apps/be/src/auth.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { workspaceMembers, workspaces } from "./db/schema";
import { createAuth } from "./auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "./test/harness";

let db: TestDb;
let auth: ReturnType<typeof createAuth>;

describe("BetterAuth post-signup hook", () => {
  beforeAll(async () => {
    db = await getTestDb();
    auth = createAuth(db, {
      secret: "x".repeat(64),
      baseURL: "http://localhost:8787",
    });
  });
  beforeEach(async () => {
    await truncateAll(db);
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("creates a workspace and owner membership on first signup", async () => {
    // Use BetterAuth's server API directly. Exact signature per ctx7 docs.
    const res = await auth.api.signUpEmail({
      body: { email: "ada@example.test", password: "pw-long-enough-123", name: "Ada" },
    });
    expect(res).toBeTruthy();

    const allWs = await db.select().from(workspaces);
    expect(allWs).toHaveLength(1);
    const members = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, allWs[0]!.id));
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");
  });
});
```

_Note:_ The exact call signature for `auth.api.signUpEmail` may differ per BetterAuth version. If so, adjust to match the `ctx7` docs; the assertion (workspace + membership created) is what matters.

- [ ] **Step 4: BetterAuth needs its own tables. Run its migration.**

BetterAuth's Drizzle adapter typically provides a CLI to generate its schema, or it auto-migrates at first use. Verify via the `ctx7` doc from Task 1. If a CLI step is required, add it to `apps/be/package.json` scripts as `auth:generate` and run it now, then re-run `pnpm db:migrate`.

If BetterAuth does **not** auto-migrate, add its generated schema file(s) under `apps/be/src/db/auth-schema.ts` and re-export in `apps/be/src/db/schema/index.ts`.

- [ ] **Step 5: Run the auth test.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/auth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/be/src/auth.ts apps/be/src/auth.test.ts apps/be/src/db apps/be/package.json
git commit -m "feat(be): wire better-auth with post-signup workspace creation"
```

---

## Task 20: Auth middleware (session + workspace scope)

**Files:**

- Create: `apps/be/src/middleware/auth.ts`
- Create: `apps/be/src/middleware/auth.test.ts`

- [ ] **Step 1: Implement `apps/be/src/middleware/auth.ts`.**

```ts
import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, workspaceMembers } from "../db/schema";
import type { AuthInstance } from "../auth";

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "editor" | "viewer";
};

export type AuthEnv = {
  Variables: { auth: AuthContext; db: Db };
  Bindings: unknown;
};

export function requireSession(auth: AuthInstance, db: Db) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id) return c.json({ error: "unauthenticated" }, 401);
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, session.user.id))
      .limit(1);
    if (!membership) return c.json({ error: "no_workspace" }, 401);
    c.set("auth", {
      userId: session.user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
    });
    c.set("db", db);
    await next();
  });
}

export function requireWrite() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const auth = c.get("auth");
    if (auth.role === "viewer") return c.json({ error: "forbidden" }, 403);
    await next();
  });
}

export async function ensureDocumentInWorkspace(
  db: Db,
  documentId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId)))
    .limit(1);
  return !!row;
}
```

- [ ] **Step 2: Write a test for the middleware.**

`apps/be/src/middleware/auth.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { createAuth } from "../auth";
import { requireSession } from "./auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";

let db: TestDb;
let auth: ReturnType<typeof createAuth>;

describe("auth middleware", () => {
  beforeAll(async () => {
    db = await getTestDb();
    auth = createAuth(db, { secret: "x".repeat(64), baseURL: "http://localhost:8787" });
  });
  beforeEach(async () => {
    await truncateAll(db);
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("returns 401 when no session header is present", async () => {
    const app = new Hono().use("*", requireSession(auth, db)).get("/ping", (c) => c.text("ok"));
    const res = await app.request("/ping");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run test.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/middleware/auth.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/middleware/auth.ts apps/be/src/middleware/auth.test.ts
git commit -m "feat(be): add session + workspace auth middleware"
```

---

## Task 21: /me and documents routes

**Files:**

- Create: `apps/be/src/routes/me.ts`
- Create: `apps/be/src/routes/documents.ts`
- Create: `apps/be/src/routes/documents.test.ts`

- [ ] **Step 1: Implement `apps/be/src/routes/me.ts`.**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AuthEnv } from "../middleware/auth";
import { workspaces } from "../db/schema";

export const meRouter = new Hono<AuthEnv>().get("/", async (c) => {
  const { userId, workspaceId, role } = c.get("auth");
  const db = c.get("db");
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return c.json({ user: { id: userId }, workspace: ws, role });
});
```

- [ ] **Step 2: Implement `apps/be/src/routes/documents.ts`.**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { documents, sections } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection } from "../services/section-write";
import type { AuthEnv } from "../middleware/auth";
import { requireWrite } from "../middleware/auth";

const listQuery = z.object({
  status: z.enum(["draft", "review", "published", "archived"]).optional(),
  parentId: z.union([z.string().uuid(), z.literal("null")]).optional(),
});

const createBody = z.object({
  title: z.string().optional(),
  emoji: z.string().optional(),
  docType: z.enum(["prd", "strategy", "spec", "rfc", "other"]).optional(),
  status: z.enum(["draft", "review", "published", "archived"]).optional(),
  parentDocumentId: z.string().uuid().nullable().optional(),
});

const patchBody = z.object({
  expectedUpdatedAt: z.string().datetime(),
  title: z.string().optional(),
  emoji: z.string().nullable().optional(),
  docType: z.enum(["prd", "strategy", "spec", "rfc", "other"]).optional(),
  status: z.enum(["draft", "review", "published", "archived"]).optional(),
  parentDocumentId: z.string().uuid().nullable().optional(),
  frontmatter: z.record(z.unknown()).optional(),
});

export const documentsRouter = new Hono<AuthEnv>()
  .get("/", zValidator("query", listQuery), async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const q = c.req.valid("query");
    const conds = [eq(documents.workspaceId, workspaceId)];
    if (q.status) conds.push(eq(documents.status, q.status));
    if (q.parentId === "null") conds.push(isNull(documents.parentDocumentId));
    else if (q.parentId) conds.push(eq(documents.parentDocumentId, q.parentId));
    const rows = await db
      .select()
      .from(documents)
      .where(and(...conds))
      .orderBy(desc(documents.updatedAt));
    return c.json(rows);
  })
  .post("/", requireWrite(), zValidator("json", createBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const body = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          workspaceId,
          title: body.title ?? "Untitled",
          emoji: body.emoji,
          docType: body.docType ?? "other",
          status: body.status ?? "draft",
          parentDocumentId: body.parentDocumentId ?? null,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();
      if (!doc) throw new Error("insert failed");
      const section = await createSection(tx, {
        documentId: doc.id,
        userId,
        orderKey: keyAfter(null),
        contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      });
      return { doc, section };
    });
    return c.json({ document: result.doc, sections: [result.section] }, 201);
  })
  .get("/:id", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)));
    if (!doc) return c.json({ error: "not_found" }, 404);
    const secs = await db
      .select()
      .from(sections)
      .where(eq(sections.documentId, id))
      .orderBy(asc(sections.orderKey));
    return c.json({ document: doc, sections: secs });
  })
  .patch("/:id", requireWrite(), zValidator("json", patchBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [existing] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)));
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (existing.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      return c.json({ error: "conflict", currentUpdatedAt: existing.updatedAt.toISOString() }, 409);
    }
    const setPatch: Record<string, unknown> = { updatedBy: userId };
    if (body.title !== undefined) setPatch.title = body.title;
    if (body.emoji !== undefined) setPatch.emoji = body.emoji;
    if (body.docType !== undefined) setPatch.docType = body.docType;
    if (body.status !== undefined) setPatch.status = body.status;
    if (body.parentDocumentId !== undefined) setPatch.parentDocumentId = body.parentDocumentId;
    if (body.frontmatter !== undefined) setPatch.frontmatter = body.frontmatter;
    const [updated] = await db
      .update(documents)
      .set(setPatch)
      .where(eq(documents.id, id))
      .returning();
    return c.json(updated);
  })
  .delete("/:id", requireWrite(), async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const result = await db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)))
      .returning({ id: documents.id });
    if (result.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });
```

- [ ] **Step 3: Add @hono/zod-validator dep.**

```bash
cd apps/be && vp add @hono/zod-validator
```

- [ ] **Step 4: Write routes test.**

`apps/be/src/routes/documents.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { documentsRouter } from "./documents";
import { workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
const USER = "user-a";

async function buildApp(): Promise<Hono<AuthEnv>> {
  const a = new Hono<AuthEnv>();
  a.use("*", async (c, next) => {
    c.set("db", db);
    c.set("auth", { userId: USER, workspaceId: wsId, role: "owner" });
    await next();
  });
  a.route("/documents", documentsRouter);
  return a;
}

describe("documents routes", () => {
  beforeAll(async () => {
    db = await getTestDb();
  });
  beforeEach(async () => {
    await truncateAll(db);
    const [ws] = await db
      .insert(workspaces)
      .values({ name: "T", slug: `t-${Date.now()}` })
      .returning();
    wsId = ws!.id;
    await db.insert(workspaceMembers).values({ workspaceId: wsId, userId: USER, role: "owner" });
    app = await buildApp();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("POST creates a document with one initial section", async () => {
    const res = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "My doc" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      document: { id: string; title: string };
      sections: unknown[];
    };
    expect(body.document.title).toBe("My doc");
    expect(body.sections).toHaveLength(1);
  });

  it("GET /documents/:id returns doc + sections", async () => {
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string } };
    const res = await app.request(`/documents/${document.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sections: unknown[] };
    expect(body.sections).toHaveLength(1);
  });

  it("GET /documents/:id returns 404 for doc in another workspace", async () => {
    const [ws2] = await db
      .insert(workspaces)
      .values({ name: "Other", slug: `o-${Date.now()}` })
      .returning();
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string } };
    // Swap workspace on the context to simulate cross-ws request
    const otherApp = new Hono<AuthEnv>();
    otherApp.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: "other", workspaceId: ws2!.id, role: "owner" });
      await next();
    });
    otherApp.route("/documents", documentsRouter);
    const res = await otherApp.request(`/documents/${document.id}`);
    expect(res.status).toBe(404);
  });

  it("PATCH returns 409 on stale expectedUpdatedAt", async () => {
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string; updatedAt: string } };
    const res = await app.request(`/documents/${document.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedUpdatedAt: new Date(0).toISOString(),
        title: "renamed",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("DELETE cascades to sections", async () => {
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string } };
    const del = await app.request(`/documents/${document.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const get = await app.request(`/documents/${document.id}`);
    expect(get.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run tests.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/routes/documents.test.ts
```

Expected: all 5 cases PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/be/src/routes/me.ts apps/be/src/routes/documents.ts apps/be/src/routes/documents.test.ts apps/be/package.json apps/be/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "feat(be): add me route and documents CRUD"
```

---

## Task 22: Sections routes (create, patch, delete)

**Files:**

- Create: `apps/be/src/routes/sections.ts`
- Create: `apps/be/src/routes/sections.test.ts`

- [ ] **Step 1: Implement `apps/be/src/routes/sections.ts`.**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { documents, sections } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection, updateSection, VersionConflictError } from "../services/section-write";
import { ensureDocumentInWorkspace } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";
import { requireWrite } from "../middleware/auth";

const createBody = z.object({
  orderKey: z.string().optional(),
  kind: z.enum(["prose", "list", "table", "code", "callout", "embed"]).optional(),
  contentJson: z.unknown().optional(),
  label: z.string().nullable().optional(),
  frontmatter: z.record(z.unknown()).optional(),
});

const patchBody = z.object({
  expectedVersion: z.number().int().positive(),
  contentJson: z.unknown().optional(),
  label: z.string().nullable().optional(),
  kind: z.enum(["prose", "list", "table", "code", "callout", "embed"]).optional(),
  frontmatter: z.record(z.unknown()).optional(),
  orderKey: z.string().optional(),
});

export const sectionsRouter = new Hono<AuthEnv>()
  .post("/documents/:docId/sections", requireWrite(), zValidator("json", createBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const docId = c.req.param("docId");
    if (!(await ensureDocumentInWorkspace(db, docId, workspaceId)))
      return c.json({ error: "not_found" }, 404);
    const body = c.req.valid("json");
    const orderKey = body.orderKey ?? (await computeNextOrderKey(db, docId));
    const section = await createSection(db, {
      documentId: docId,
      userId,
      orderKey,
      contentJson: body.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
      label: body.label ?? null,
      kind: body.kind,
      frontmatter: body.frontmatter,
    });
    return c.json(section, 201);
  })
  .patch("/sections/:id", requireWrite(), zValidator("json", patchBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ documentId: sections.documentId, workspaceId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.workspaceId !== workspaceId) return c.json({ error: "not_found" }, 404);
    const body = c.req.valid("json");
    try {
      const updated = await updateSection(db, {
        sectionId: id,
        expectedVersion: body.expectedVersion,
        userId,
        patch: {
          contentJson: body.contentJson,
          label: body.label,
          kind: body.kind,
          frontmatter: body.frontmatter,
          orderKey: body.orderKey,
        },
      });
      return c.json(updated);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        const [current] = await db.select().from(sections).where(eq(sections.id, id));
        return c.json(
          {
            error: "version_conflict",
            currentVersion: err.currentVersion,
            currentSection: current,
          },
          409,
        );
      }
      throw err;
    }
  })
  .delete("/sections/:id", requireWrite(), async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ workspaceId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.workspaceId !== workspaceId) return c.json({ error: "not_found" }, 404);
    await db.delete(sections).where(eq(sections.id, id));
    return c.json({ ok: true });
  });

async function computeNextOrderKey(db: AuthEnv["Variables"]["db"], docId: string): Promise<string> {
  const rows = await db
    .select({ orderKey: sections.orderKey })
    .from(sections)
    .where(eq(sections.documentId, docId));
  const last =
    rows
      .map((r) => r.orderKey)
      .sort()
      .at(-1) ?? null;
  return keyAfter(last);
}
```

- [ ] **Step 2: Write routes test.**

`apps/be/src/routes/sections.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { sectionsRouter } from "./sections";
import { documents, workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
let docId: string;
const USER = "user-a";

describe("sections routes", () => {
  beforeAll(async () => {
    db = await getTestDb();
  });
  beforeEach(async () => {
    await truncateAll(db);
    const [ws] = await db
      .insert(workspaces)
      .values({ name: "T", slug: `t-${Date.now()}` })
      .returning();
    wsId = ws!.id;
    await db.insert(workspaceMembers).values({ workspaceId: wsId, userId: USER, role: "owner" });
    const [doc] = await db
      .insert(documents)
      .values({ workspaceId: wsId, createdBy: USER, updatedBy: USER, title: "D" })
      .returning();
    docId = doc!.id;
    app = new Hono<AuthEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: USER, workspaceId: wsId, role: "owner" });
      await next();
    });
    app.route("/", sectionsRouter);
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("POST creates a section with version=1", async () => {
    const res = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
        },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { version: number; contentText: string };
    expect(body.version).toBe(1);
    expect(body.contentText).toBe("x");
  });

  it("PATCH with correct expectedVersion returns updated section with version=2", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string; version: number };
    const res = await app.request(`/sections/${section.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: section.version,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "updated" }] }],
        },
      }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { version: number; contentText: string };
    expect(updated.version).toBe(2);
    expect(updated.contentText).toBe("updated");
  });

  it("PATCH with stale expectedVersion returns 409 with currentVersion", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string };
    const res = await app.request(`/sections/${section.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 999, label: "x" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; currentVersion: number };
    expect(body.error).toBe("version_conflict");
    expect(body.currentVersion).toBe(1);
  });

  it("PATCH to foreign workspace section returns 404", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string; version: number };

    const [ws2] = await db
      .insert(workspaces)
      .values({ name: "O", slug: `o-${Date.now()}` })
      .returning();
    const other = new Hono<AuthEnv>();
    other.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: "u2", workspaceId: ws2!.id, role: "owner" });
      await next();
    });
    other.route("/", sectionsRouter);
    const res = await other.request(`/sections/${section.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: section.version, label: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE removes the section", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string };
    const res = await app.request(`/sections/${section.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run tests.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/routes/sections.test.ts
```

Expected: all 5 cases PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/routes/sections.ts apps/be/src/routes/sections.test.ts
git commit -m "feat(be): add sections create/patch/delete routes"
```

---

## Task 23: Section version snapshot routes

**Files:**

- Modify: `apps/be/src/routes/sections.ts`
- Create: `apps/be/src/routes/sections-versions.test.ts`

- [ ] **Step 1: Add version routes to `sections.ts`.**

Append to the chain in `apps/be/src/routes/sections.ts` (before the final export):

```ts
  .post(
    "/sections/:id/versions",
    requireWrite(),
    zValidator("json", z.object({ changeSummary: z.string().optional() })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      const [row] = await db
        .select({
          section: sections,
          workspaceId: documents.workspaceId,
        })
        .from(sections)
        .innerJoin(documents, eq(documents.id, sections.documentId))
        .where(eq(sections.id, id));
      if (!row || row.workspaceId !== workspaceId) return c.json({ error: "not_found" }, 404);
      const s = row.section;
      const inserted = await db.transaction(async (tx) => {
        const [{ max }] = (await tx.execute(
          sql`select coalesce(max(version_number), 0) as max from section_versions where section_id = ${id}`,
        )) as unknown as [{ max: number }];
        const nextNumber = Number(max) + 1;
        const [version] = await tx
          .insert(sectionVersions)
          .values({
            sectionId: id,
            versionNumber: nextNumber,
            contentJson: s.contentJson,
            contentText: s.contentText,
            contentHash: s.contentHash,
            label: s.label,
            changeSummary: c.req.valid("json").changeSummary ?? null,
            changedBy: userId,
            changedByType: "user",
          })
          .returning();
        return version;
      });
      return c.json(inserted, 201);
    },
  )
  .get("/sections/:id/versions", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ workspaceId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.workspaceId !== workspaceId) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(sectionVersions)
      .where(eq(sectionVersions.sectionId, id))
      .orderBy(desc(sectionVersions.versionNumber));
    return c.json(rows);
  })
  .get("/sections/:id/versions/:n", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const n = Number(c.req.param("n"));
    const [row] = await db
      .select({ workspaceId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.workspaceId !== workspaceId) return c.json({ error: "not_found" }, 404);
    const [v] = await db
      .select()
      .from(sectionVersions)
      .where(and(eq(sectionVersions.sectionId, id), eq(sectionVersions.versionNumber, n)));
    if (!v) return c.json({ error: "not_found" }, 404);
    return c.json(v);
  });
```

Also add imports at the top of the file:

```ts
import { desc, sql } from "drizzle-orm";
import { sectionVersions } from "../db/schema";
```

- [ ] **Step 2: Write the versions test.**

`apps/be/src/routes/sections-versions.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { sectionsRouter } from "./sections";
import { documents, workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
let docId: string;
const USER = "u";

describe("section versions", () => {
  beforeAll(async () => {
    db = await getTestDb();
  });
  beforeEach(async () => {
    await truncateAll(db);
    const [ws] = await db
      .insert(workspaces)
      .values({ name: "T", slug: `t-${Date.now()}` })
      .returning();
    wsId = ws!.id;
    await db.insert(workspaceMembers).values({ workspaceId: wsId, userId: USER, role: "owner" });
    const [doc] = await db
      .insert(documents)
      .values({ workspaceId: wsId, createdBy: USER, updatedBy: USER, title: "D" })
      .returning();
    docId = doc!.id;
    app = new Hono<AuthEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: USER, workspaceId: wsId, role: "owner" });
      await next();
    });
    app.route("/", sectionsRouter);
  });
  afterAll(async () => closeTestDb());

  it("creates sequential version numbers starting at 1", async () => {
    const s = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const section = (await s.json()) as { id: string; version: number };
    const v1 = await app.request(`/sections/${section.id}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changeSummary: "first" }),
    });
    expect(v1.status).toBe(201);
    const v1body = (await v1.json()) as { versionNumber: number };
    expect(v1body.versionNumber).toBe(1);
    const v2 = await app.request(`/sections/${section.id}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const v2body = (await v2.json()) as { versionNumber: number };
    expect(v2body.versionNumber).toBe(2);
  });

  it("does not affect sections.version", async () => {
    const s = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const section = (await s.json()) as { id: string; version: number };
    await app.request(`/sections/${section.id}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const get = await app.request(`/documents/${docId}`);
    const body = (await get.json()) as { sections: Array<{ id: string; version: number }> };
    const same = body.sections.find((x) => x.id === section.id);
    expect(same?.version).toBe(1);
  });
});
```

Note the second test references `/documents/:id` — for simplicity, duplicate the doc-get handler inline in this test app (copy of the relevant part of documents.ts) or mount `documentsRouter` too. Simpler: mount both routers in the test app:

```ts
import { documentsRouter } from "./documents";
// ...
app.route("/documents", documentsRouter);
app.route("/", sectionsRouter);
```

Replace the previous `app.route(...)` line with those two.

- [ ] **Step 3: Run tests.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/routes/sections-versions.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/routes/sections.ts apps/be/src/routes/sections-versions.test.ts
git commit -m "feat(be): add section manual version snapshot routes"
```

---

## Task 24: Comments routes

**Files:**

- Create: `apps/be/src/routes/comments.ts`
- Create: `apps/be/src/routes/comments.test.ts`

- [ ] **Step 1: Implement `apps/be/src/routes/comments.ts`.**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { commentThreads, comments, documents, sections } from "../db/schema";
import { requireWrite } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

async function sectionInWorkspace(
  db: AuthEnv["Variables"]["db"],
  sectionId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ workspaceId: documents.workspaceId })
    .from(sections)
    .innerJoin(documents, eq(documents.id, sections.documentId))
    .where(eq(sections.id, sectionId));
  return !!row && row.workspaceId === workspaceId;
}

async function threadInWorkspace(
  db: AuthEnv["Variables"]["db"],
  threadId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ workspaceId: documents.workspaceId })
    .from(commentThreads)
    .innerJoin(sections, eq(sections.id, commentThreads.sectionId))
    .innerJoin(documents, eq(documents.id, sections.documentId))
    .where(eq(commentThreads.id, threadId));
  return !!row && row.workspaceId === workspaceId;
}

export const commentsRouter = new Hono<AuthEnv>()
  .post(
    "/sections/:id/threads",
    requireWrite(),
    zValidator("json", z.object({ body: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const sectionId = c.req.param("id");
      if (!(await sectionInWorkspace(db, sectionId, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const { body } = c.req.valid("json");
      const result = await db.transaction(async (tx) => {
        const [thread] = await tx
          .insert(commentThreads)
          .values({ sectionId, createdBy: userId })
          .returning();
        if (!thread) throw new Error("thread insert failed");
        const [comment] = await tx
          .insert(comments)
          .values({ threadId: thread.id, authorId: userId, body })
          .returning();
        return { thread, comments: [comment] };
      });
      return c.json(result, 201);
    },
  )
  .get("/sections/:id/threads", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const sectionId = c.req.param("id");
    if (!(await sectionInWorkspace(db, sectionId, workspaceId)))
      return c.json({ error: "not_found" }, 404);
    const rows = await db.execute(sql`
      select t.*, (
        select to_jsonb(first_comment) from (
          select * from comments c where c.thread_id = t.id order by c.created_at asc limit 1
        ) first_comment
      ) as first_comment,
      (select count(*)::int from comments c where c.thread_id = t.id) as comment_count
      from comment_threads t
      where t.section_id = ${sectionId}
      order by t.created_at asc
    `);
    return c.json(rows);
  })
  .patch(
    "/threads/:id",
    requireWrite(),
    zValidator("json", z.object({ status: z.enum(["open", "resolved"]) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      if (!(await threadInWorkspace(db, id, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const { status } = c.req.valid("json");
      const [updated] = await db
        .update(commentThreads)
        .set({
          status,
          resolvedAt: status === "resolved" ? sql`now()` : null,
          resolvedBy: status === "resolved" ? userId : null,
        })
        .where(eq(commentThreads.id, id))
        .returning();
      return c.json(updated);
    },
  )
  .get("/threads/:id/comments", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    if (!(await threadInWorkspace(db, id, workspaceId))) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.threadId, id))
      .orderBy(asc(comments.createdAt));
    return c.json(rows);
  })
  .post(
    "/threads/:id/comments",
    requireWrite(),
    zValidator("json", z.object({ body: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      if (!(await threadInWorkspace(db, id, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const { body } = c.req.valid("json");
      const [inserted] = await db
        .insert(comments)
        .values({ threadId: id, authorId: userId, body })
        .returning();
      return c.json(inserted, 201);
    },
  )
  .patch(
    "/comments/:id",
    requireWrite(),
    zValidator("json", z.object({ body: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      const [row] = await db
        .select({ authorId: comments.authorId, threadId: comments.threadId })
        .from(comments)
        .where(eq(comments.id, id));
      if (!row) return c.json({ error: "not_found" }, 404);
      if (row.authorId !== userId) return c.json({ error: "forbidden" }, 403);
      if (!(await threadInWorkspace(db, row.threadId, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const [updated] = await db
        .update(comments)
        .set({ body: c.req.valid("json").body, editedAt: sql`now()` })
        .where(eq(comments.id, id))
        .returning();
      return c.json(updated);
    },
  )
  .delete("/comments/:id", requireWrite(), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ authorId: comments.authorId, threadId: comments.threadId })
      .from(comments)
      .where(eq(comments.id, id));
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.authorId !== userId) return c.json({ error: "forbidden" }, 403);
    if (!(await threadInWorkspace(db, row.threadId, workspaceId)))
      return c.json({ error: "not_found" }, 404);
    await db.transaction(async (tx) => {
      await tx.delete(comments).where(eq(comments.id, id));
      const [{ count }] = (await tx.execute(
        sql`select count(*)::int as count from comments where thread_id = ${row.threadId}`,
      )) as unknown as [{ count: number }];
      if (Number(count) === 0) {
        await tx.delete(commentThreads).where(eq(commentThreads.id, row.threadId));
      }
    });
    return c.json({ ok: true });
  });
```

- [ ] **Step 2: Write the comments test.**

`apps/be/src/routes/comments.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { commentsRouter } from "./comments";
import { documents, sections, workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";
import { keyAfter } from "../lib/order-key";
import { createSection } from "../services/section-write";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
let sectionId: string;
const USER = "u1";
const OTHER = "u2";

describe("comments routes", () => {
  beforeAll(async () => {
    db = await getTestDb();
  });
  beforeEach(async () => {
    await truncateAll(db);
    const [ws] = await db
      .insert(workspaces)
      .values({ name: "T", slug: `t-${Date.now()}` })
      .returning();
    wsId = ws!.id;
    await db.insert(workspaceMembers).values({ workspaceId: wsId, userId: USER, role: "owner" });
    const [doc] = await db
      .insert(documents)
      .values({ workspaceId: wsId, createdBy: USER, updatedBy: USER, title: "D" })
      .returning();
    const section = await createSection(db, {
      documentId: doc!.id,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: { type: "doc", content: [] },
    });
    sectionId = section.id;

    app = new Hono<AuthEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: USER, workspaceId: wsId, role: "owner" });
      await next();
    });
    app.route("/", commentsRouter);
  });
  afterAll(async () => closeTestDb());

  it("creates a thread with first comment", async () => {
    const res = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hello" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { thread: { id: string }; comments: unknown[] };
    expect(body.thread.id).toBeTruthy();
    expect(body.comments).toHaveLength(1);
  });

  it("non-author cannot edit a comment", async () => {
    const create = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "mine" }),
    });
    const body = (await create.json()) as { comments: Array<{ id: string }> };
    const commentId = body.comments[0]!.id;

    const other = new Hono<AuthEnv>();
    other.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: OTHER, workspaceId: wsId, role: "owner" });
      await next();
    });
    other.route("/", commentsRouter);
    const res = await other.request(`/comments/${commentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hacked" }),
    });
    expect(res.status).toBe(403);
  });

  it("deleting last comment deletes thread", async () => {
    const create = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "only" }),
    });
    const body = (await create.json()) as {
      thread: { id: string };
      comments: Array<{ id: string }>;
    };
    const del = await app.request(`/comments/${body.comments[0]!.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const list = await app.request(`/sections/${sectionId}/threads`);
    expect((await list.json()) as unknown[]).toHaveLength(0);
  });

  it("resolve flips status and sets resolvedAt", async () => {
    const create = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "q" }),
    });
    const { thread } = (await create.json()) as { thread: { id: string } };
    const res = await app.request(`/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; resolvedAt: string | null };
    expect(body.status).toBe("resolved");
    expect(body.resolvedAt).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/routes/comments.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/be/src/routes/comments.ts apps/be/src/routes/comments.test.ts
git commit -m "feat(be): add comment threads and comments routes"
```

---

## Task 25: Dev seed route

**Files:**

- Create: `apps/be/src/routes/dev.ts`

- [ ] **Step 1: Implement the dev seed route.**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { documents, sections } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection } from "../services/section-write";
import type { AuthEnv } from "../middleware/auth";

export const devRouter = new Hono<AuthEnv>().post("/seed", async (c) => {
  const db = c.get("db");
  const { userId, workspaceId } = c.get("auth");
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .limit(1);
  if (existing.length > 0) return c.json({ ok: true, skipped: true });
  await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        workspaceId,
        createdBy: userId,
        updatedBy: userId,
        title: "Onboarding notes",
        emoji: "🌿",
      })
      .returning();
    if (!doc) throw new Error("seed doc insert failed");
    let prev: string | null = null;
    for (const [kind, text] of [
      ["prose", "Welcome to Patram — sections now live on their own."],
      ["prose", "Every section has a version, an optional label, and its own content."],
    ] as const) {
      prev = keyAfter(prev);
      await createSection(tx, {
        documentId: doc.id,
        userId,
        orderKey: prev,
        kind,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        },
      });
    }
  });
  return c.json({ ok: true, skipped: false });
});
```

- [ ] **Step 2: Commit (no separate test — exercised via the app integration test in Task 26).**

```bash
git add apps/be/src/routes/dev.ts
git commit -m "feat(be): add dev seed route"
```

---

## Task 26: Assemble the Hono app and export AppType

**Files:**

- Rewrite: `apps/be/src/index.ts`
- Create: `apps/be/src/index.test.ts`

- [ ] **Step 1: Implement `apps/be/src/index.ts`.**

```ts
import { Hono } from "hono";
import { createAuth } from "./auth";
import { createDb } from "./db/client";
import { parseEnv } from "./env";
import { requireSession } from "./middleware/auth";
import { commentsRouter } from "./routes/comments";
import { devRouter } from "./routes/dev";
import { documentsRouter } from "./routes/documents";
import { meRouter } from "./routes/me";
import { sectionsRouter } from "./routes/sections";

type Bindings = Record<string, string | undefined>;

const app = new Hono<{ Bindings: Bindings }>()
  .get("/health", (c) => c.json({ ok: true }))
  .all("/auth/*", async (c) => {
    const env = parseEnv(c.env as Record<string, string | undefined>);
    const db = createDb(env.DATABASE_URL);
    const auth = createAuth(db, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL });
    return auth.handler(c.req.raw);
  });

app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/auth") || c.req.path === "/health") return next();
  const env = parseEnv(c.env as Record<string, string | undefined>);
  const db = createDb(env.DATABASE_URL);
  const auth = createAuth(db, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL });
  return requireSession(auth, db)(c, next);
});

const routes = app
  .route("/me", meRouter)
  .route("/documents", documentsRouter)
  .route("/", sectionsRouter)
  .route("/", commentsRouter);

const withDev = routes
  .use("/dev/*", async (c, next) => {
    const env = parseEnv(c.env as Record<string, string | undefined>);
    if (!env.DEV_SEED) return c.json({ error: "not_found" }, 404);
    await next();
  })
  .route("/dev", devRouter);

export type AppType = typeof withDev;
export default withDev;
```

- [ ] **Step 2: Write the app-level smoke test.**

`apps/be/src/index.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import app from "./index";

describe("app", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("GET /documents without session returns 401", async () => {
    const res = await app.request(
      "/documents",
      {
        headers: {},
      },
      {
        DATABASE_URL: process.env.DATABASE_URL!,
        BETTER_AUTH_SECRET: "x".repeat(64),
        BETTER_AUTH_URL: "http://localhost:8787",
        DEV_SEED: "0",
      },
    );
    expect(res.status).toBe(401);
  });
});
```

_Note:_ Hono's `app.request(path, init, env)` third arg passes bindings to the worker handler. Verify via `ctx7` if signatures differ in the installed version.

- [ ] **Step 3: Run tests.**

```bash
DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run src/index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full test suite.**

```bash
cd apps/be && DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run
```

Expected: every test across all files passes.

- [ ] **Step 5: Run `vp check`.**

```bash
vp check
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/be/src/index.ts apps/be/src/index.test.ts
git commit -m "feat(be): assemble hono app with auth gating and export AppType"
```

---

## Self-Review Checklist (for the executor to run at the end)

Before declaring the plan complete, the executor MUST:

- [ ] Run `cd apps/be && pnpm db:up && DATABASE_URL=postgres://patram:patram@localhost:5433/patram vp test run` — every test passes.
- [ ] Run `vp check` from repo root — no lint/type errors.
- [ ] Confirm `apps/be/src/db/migrations/` contains the initial migration with the tsvector generated column and GIN index.
- [ ] Confirm `apps/be/wrangler.jsonc` has `nodejs_compat` enabled.
- [ ] Confirm `apps/be/src/index.ts` exports `AppType`.
- [ ] Confirm no route accepts `contentText`, `contentTsv`, `contentHash`, or `version` in a request body (grep the validators; spec §12 gate).
- [ ] Commit any remaining fixes on top.

## Spec-to-task coverage map

| Spec section                                  | Task(s)            |
| --------------------------------------------- | ------------------ |
| §4 Architectural shape / package layout       | 1, 26              |
| §5 Enums                                      | 3                  |
| §6.1–6.3 workspaces, users, workspace_members | 4, 19              |
| §6.4 documents                                | 5                  |
| §6.5 sections (with tsvector)                 | 6, 11              |
| §6.6 section_versions                         | 7                  |
| §6.7 section_links                            | 8, 18              |
| §6.8–6.9 comment_threads, comments            | 9, 24              |
| §6.10 ai_suggestions stub                     | 10                 |
| §6.11 relationships stub                      | 10                 |
| §7 BetterAuth wiring + post-signup hook       | 19                 |
| §7 Auth middleware + 404-on-cross-ws          | 20, 21, 22, 23, 24 |
| §8.1 /me                                      | 21                 |
| §8.2 documents routes                         | 21                 |
| §8.3 sections routes (create/patch/delete)    | 22                 |
| §8.3 section version routes                   | 23                 |
| §8.4 comments routes                          | 24                 |
| §8.5 dev seed                                 | 25                 |
| §9 Content derivation pipeline                | 12, 13, 14, 15, 18 |
| §9 Optimistic concurrency on sections         | 18, 22             |
| §11 Migrations                                | 11                 |
| §12 Quality gates                             | final self-review  |
