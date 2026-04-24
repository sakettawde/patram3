# Patram — Sections as First-Class Persistence (v1)

**Date:** 2026-04-24
**Status:** Approved design, ready for implementation planning
**Scope:** Drizzle schema, Cloudflare-Workers/Hono BE API, BetterAuth wiring, and server-side content pipeline. SPA rewire is a follow-up spec.
**Supersedes (partially):** §9 ("State") of [2026-04-23-patram-document-ui-design.md](./2026-04-23-patram-document-ui-design.md) — the monolithic per-document `contentJson` model is replaced by per-section content. Everything else in that spec (layout, sidebar, editor, slash/bubble menus) still stands.

## 1. Goal

Turn sections — not whole documents — into the unit of persistence, editing, versioning, and (later) embedding / agent mutation. A document becomes an ordered list of sections plus metadata. This spec defines:

1. The Drizzle schema that models this.
2. The Hono (Cloudflare Workers) API surface that exposes it.
3. BetterAuth integration and the authZ boundary.
4. The server-side content-derivation pipeline (text extraction, hashing, link extraction).

## 2. Non-goals (v1 of persistence)

Explicitly out of scope — must not be built in this pass:

- SPA rewire from Zustand-backed in-memory state to API-backed state. The _end state_ for the SPA is described here so the follow-up spec does not rediscover it, but the wiring itself is deferred.
- Cloudflare AI Search sync (embedding/indexing/query worker). `contentHash` is the intended trigger signal; no worker, queue binding, or outbound call is built here.
- Agent-authored writes and `ai_suggestions` endpoints. Table exists; nothing writes to it.
- Explicit doc-level `relationships` endpoints. Table exists; nothing writes to it.
- Workspace invitation flows, member management UI, workspace switcher, roles other than `owner` in practice. Schema supports all of it; UI does not.
- Yjs / real-time collaboration. `sections.ydocState` column reserved; not populated.
- Export (PDF/MD/HTML), sharing, permissions UI.
- Pagination on list endpoints. Data volumes in v1 are small enough to return whole.
- Auto-snapshotting section versions on idle, on save, or on status change. Versioning is manual only in v1.
- Soft delete on any table. Deletes are hard with FK cascades where appropriate.

## 3. Foundational model

- **Sections own content.** Every `sections` row carries a ProseMirror JSON blob (`contentJson`) as the source of truth for its own content.
- **Documents own metadata.** `documents` has title, emoji, doc-type, status, frontmatter, and hierarchy — never content.
- **Sections are a flat ordered list under a document.** No `parentSectionId`. Ordering is a single dimension via `orderKey` (fractional index). Nesting, if ever needed, is a later schema addition.
- **Cross-document/cross-section references are first-class.** Rendered as a Tiptap `docLink` mark inside content, extracted by the BE on save into a `section_links` table so backlinks are queryable.
- **Optimistic concurrency on sections.** Every section has a `version` counter. Writes require the caller to assert the expected version; server rejects on mismatch.
- **All derived fields are server-derived.** `contentText`, `contentTsv`, `contentHash`, and `section_links` rows are computed on the BE from `contentJson` — the client never sends them.
- **Versioning is manual.** `section_versions` rows are created only on explicit user action. The live section is always the tip.
- **Auth is real, workspaces are single.** BetterAuth manages users/sessions; on signup, one workspace and one `workspace_members(role=owner)` row are auto-created. No workspace-picker UI.

## 4. Architectural shape

### SPA (`apps/fe`)

- Stays client-only. Tanstack Start configured as SPA. No server-side code lives here.
- Zustand store is reduced to **ephemeral UI state only**: selected doc id, selected section id, slash-menu open state, bubble-menu state, etc.
- Persistent state (documents, sections, versions, comments) is fetched via a typed Hono RPC client and cached with React Query. The Hono client imports the BE app type directly — no intermediate shared-types package.
- Sections are eagerly loaded with their parent document in one round-trip.
- Each Tiptap editor instance debounces writes to its own `PATCH /sections/:id`, carrying `expectedVersion`.

### BE (`apps/be`)

- Hono on Cloudflare Workers (existing). Adds:
  - Drizzle schema + migrations (under `src/db/`).
  - BetterAuth instance (`src/auth.ts`) using BetterAuth's Drizzle adapter.
  - Content pipeline helpers (`src/lib/content/*`).
  - Route modules mounted by feature (documents, sections, comments, auth).
- Is the sole owner of business logic: content derivation, version-row appending, link extraction, authZ enforcement.
- Exports its app type from `src/index.ts` so the SPA can pull inferred types.

### Package layout

```
apps/
  be/
    src/
      index.ts                # Hono app, route mounting, export type AppType = typeof app
      auth.ts                 # BetterAuth instance + middleware
      db/
        client.ts             # Drizzle client (PG serverless driver)
        schema/
          index.ts            # re-exports
          enums.ts
          workspaces.ts
          documents.ts
          sections.ts
          section-versions.ts
          section-links.ts
          comments.ts
          ai-suggestions.ts   # stub table only
          relationships.ts    # stub table only
        migrations/           # drizzle-kit output
      routes/
        auth.ts               # mounts BetterAuth handler
        me.ts
        documents.ts
        sections.ts
        comments.ts
        dev.ts                # seed route, mounted only when DEV_SEED=1
      lib/
        content/
          canonicalize.ts     # deterministic JSON serialization
          hash.ts             # sha256(hex)
          extract-text.ts     # contentJson -> plain text
          extract-links.ts    # contentJson -> {docId, sectionId?}[]
      middleware/
        auth.ts               # session + workspace-membership check
    drizzle.config.ts
  fe/
    src/
      lib/
        api.ts                # hc<AppType>(baseUrl)
      stores/
        documents.ts          # reduced to ephemeral UI state
      queries/
        documents.ts          # React Query hooks (planned in follow-up spec)
        sections.ts
```

## 5. Enums

| Enum                    | Values                                                   | Used on                                  |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `workspace_role`        | `owner`, `editor`, `viewer`                              | `workspace_members.role`                 |
| `doc_type`              | `prd`, `strategy`, `spec`, `rfc`, `other`                | `documents.doc_type`                     |
| `doc_status`            | `draft`, `review`, `published`, `archived`               | `documents.status`                       |
| `section_kind`          | `prose`, `list`, `table`, `code`, `callout`, `embed`     | `sections.kind`                          |
| `changed_by_type`       | `user`, `agent`                                          | `section_versions.changed_by_type`       |
| `comment_thread_status` | `open`, `resolved`                                       | `comment_threads.status`                 |
| `suggestion_type`       | `insert`, `delete`, `replace`, `rewrite_section`         | `ai_suggestions.suggestion_type` (stub)  |
| `suggestion_status`     | `pending`, `accepted`, `rejected`, `superseded`          | `ai_suggestions.status` (stub)           |
| `relationship_type`     | `related`, `supersedes`, `superseded_by`, `derived_from` | `relationships.relationship_type` (stub) |

## 6. Tables

### 6.1 `workspaces`

- `id` uuid pk
- `name` text not null
- `slug` text not null unique
- `createdAt`, `updatedAt` timestamptz not null

### 6.2 `users`

Managed by BetterAuth's Drizzle adapter. BetterAuth owns this migration. Our FKs reference `users.id`.

### 6.3 `workspace_members`

- `workspaceId` uuid fk → `workspaces.id` on delete cascade
- `userId` uuid fk → `users.id` on delete cascade
- `role` `workspace_role` not null
- `createdAt` timestamptz not null
- PK `(workspaceId, userId)`
- Index: `userId`

### 6.4 `documents`

- `id` uuid pk
- `workspaceId` uuid fk → `workspaces.id` on delete cascade, not null
- `title` text not null default `'Untitled'`
- `emoji` text nullable — single grapheme
- `docType` `doc_type` not null default `'other'`
- `status` `doc_status` not null default `'draft'`
- `parentDocumentId` uuid fk → `documents.id` on delete set null, nullable
- `frontmatter` jsonb not null default `'{}'`
- `createdBy` uuid fk → `users.id` not null
- `updatedBy` uuid fk → `users.id` not null
- `createdAt`, `updatedAt` timestamptz not null
- Indexes:
  - `(workspaceId, updatedAt DESC)`
  - `(workspaceId, status)`
  - `parentDocumentId`

### 6.5 `sections` — central

- `id` uuid pk
- `documentId` uuid fk → `documents.id` on delete cascade, not null
- `orderKey` text not null — fractional index, `fractional-indexing` npm package
- `label` text nullable
- `kind` `section_kind` not null default `'prose'`
- `contentJson` jsonb not null — ProseMirror JSON, source of truth, canonical form
- `contentText` text not null default `''` — derived
- `contentTsv` tsvector — **generated column**, `GENERATED ALWAYS AS (to_tsvector('english', contentText)) STORED`
- `contentHash` text not null — SHA-256 hex of canonicalized `contentJson`
- `frontmatter` jsonb not null default `'{}'`
- `version` integer not null default `1` — optimistic-locking counter, bumped on every mutation
- `ydocState` bytea nullable — reserved, unused
- `createdBy`, `updatedBy` uuid fk → `users.id` not null
- `createdAt`, `updatedAt` timestamptz not null
- Unique: `(documentId, orderKey)`
- Indexes:
  - `(documentId, orderKey)` (unique, already serves ordered reads)
  - `contentHash`
  - GIN on `contentTsv`

### 6.6 `section_versions`

Append-only history, manual snapshots only.

- `id` uuid pk
- `sectionId` uuid fk → `sections.id` on delete cascade, not null
- `versionNumber` integer not null — monotonic per section, starts at 1
- `contentJson` jsonb not null
- `contentText` text not null
- `contentHash` text not null
- `label` text nullable — section label at snapshot time
- `changeSummary` text nullable
- `changedBy` uuid fk → `users.id` not null
- `changedByType` `changed_by_type` not null
- `changedAt` timestamptz not null
- Unique: `(sectionId, versionNumber)`
- Index: `(sectionId, versionNumber DESC)`

Note: `section_versions.versionNumber` is **independent** of `sections.version`. The former is a snapshot counter (starts at 1, increments only on manual snapshot). The latter is an optimistic-locking counter (starts at 1, increments on every write). They share a default of 1 but diverge immediately.

### 6.7 `section_links`

Derived; rewritten in full on each section save.

- `id` uuid pk
- `sourceSectionId` uuid fk → `sections.id` on delete cascade, not null
- `targetDocumentId` uuid fk → `documents.id` on delete cascade, not null
- `targetSectionId` uuid fk → `sections.id` on delete set null, nullable
- `createdAt` timestamptz not null
- Unique: `(sourceSectionId, targetDocumentId, targetSectionId)`
  - PG's null-not-equal semantics are acceptable; we rebuild the row set per save so duplicate-row concerns don't arise.
- Indexes:
  - `sourceSectionId`
  - `(targetDocumentId, targetSectionId)` — powers backlinks: "what links to this section?"

### 6.8 `comment_threads`

- `id` uuid pk
- `sectionId` uuid fk → `sections.id` on delete cascade, not null
- `status` `comment_thread_status` not null default `'open'`
- `createdBy` uuid fk → `users.id` not null
- `createdAt` timestamptz not null
- `resolvedAt` timestamptz nullable
- `resolvedBy` uuid fk → `users.id` nullable
- Index: `(sectionId, status)`

### 6.9 `comments`

- `id` uuid pk
- `threadId` uuid fk → `comment_threads.id` on delete cascade, not null
- `authorId` uuid fk → `users.id` not null
- `body` text not null
- `createdAt` timestamptz not null
- `editedAt` timestamptz nullable
- Index: `(threadId, createdAt)`

The inline anchor for a thread lives as a Tiptap `comment` mark inside `contentJson` carrying `threadId`. If that mark is removed from content during editing, the thread still exists and is rendered as "orphaned" in a comments sidebar — it is not auto-deleted.

### 6.10 `ai_suggestions` — stub

Table + Drizzle types + enums only. No routes, no service logic.

- `id` uuid pk
- `sectionId` uuid fk → `sections.id` on delete cascade, not null
- `sectionVersionAtCreation` integer not null — the `sections.version` at generation time (NOT `section_versions.versionNumber`)
- `suggestionType` `suggestion_type` not null
- `anchorFrom` integer not null
- `anchorTo` integer not null
- `anchorText` text not null
- `beforeJson` jsonb nullable
- `afterJson` jsonb nullable
- `rationale` text nullable
- `status` `suggestion_status` not null default `'pending'`
- `createdByAgent` text not null
- `createdAt` timestamptz not null
- `resolvedAt` timestamptz nullable
- `resolvedBy` uuid fk → `users.id` nullable
- Index: `(sectionId, status)`

### 6.11 `relationships` — stub

Table + enum only. Separate from `section_links`: this is for user-/agent-asserted document-level relationships, not derived link extraction.

- `id` uuid pk
- `sourceDocumentId` uuid fk → `documents.id` on delete cascade, not null
- `targetDocumentId` uuid fk → `documents.id` on delete cascade, not null
- `relationshipType` `relationship_type` not null
- `createdAt` timestamptz not null

## 7. BetterAuth wiring

- Instance: `apps/be/src/auth.ts`, exporting `auth` and `authMiddleware`.
- Adapter: BetterAuth's Drizzle adapter, pointed at the same PG as the app schema. BetterAuth owns its own `users`, `sessions`, `accounts`, etc. tables and migrations; our schema references `users.id` only.
- Mount: `app.on(["GET","POST"], "/auth/*", (c) => auth.handler(c.req.raw))`.
- Post-signup hook: on first user creation, in the same tx — insert one `workspaces` row (auto-name/slug derived from the user's email local-part with a uniqueness suffix) and one `workspace_members(userId, workspaceId, role='owner')` row.
- Providers in v1: email + password. OAuth is a later configuration toggle; no route changes needed.

### AuthN/AuthZ middleware

Applied to all routes except `/auth/*` and `/health`:

1. Resolve session → `userId`. Return 401 if absent.
2. For routes scoped to a document or section, join through to `workspace_members` and confirm the caller is a member of the relevant workspace. Return **404** (not 403) on failure — do not leak existence.
3. Attach `{ userId, workspaceId, role }` to the Hono context.

Write endpoints additionally require `role IN ('owner', 'editor')`. `viewer` is read-only. In v1 only `owner` exists in practice, but the middleware is already correct for later invites.

## 8. API surface (Hono RPC)

All routes are JSON. Client: `apps/fe/src/lib/api.ts` calls `hc<AppType>(baseUrl)`.

### 8.1 Me

- `GET /me` → `{ user, workspace }`. Boot payload. `workspace` is the caller's single workspace.

### 8.2 Documents

- `GET /documents` → list for current workspace, sorted by `updatedAt DESC`.
  - Query: `?status=draft|review|published|archived` (optional), `?parentId=<uuid>|null` (optional; `null` means top-level only).
- `POST /documents` → create. Body: `{ title?, emoji?, docType?, status?, parentDocumentId? }`.
  - In the same transaction: creates one initial `sections` row (`kind='prose'`, empty PM doc, `orderKey` = first key). Guarantees a document is never contentless.
- `GET /documents/:id` → `{ document, sections: Section[] }`. Sections eagerly loaded, sorted by `orderKey`.
- `PATCH /documents/:id` → update any of `title`, `emoji`, `docType`, `status`, `frontmatter`, `parentDocumentId`. Optimistic on `document.updatedAt` (header `If-Unmodified-Since` or body `expectedUpdatedAt`). Documents are metadata-only and low-contention, so a full `version` counter is unnecessary.
- `DELETE /documents/:id` → hard delete. Cascades to sections, section_versions, section_links (as source or as target-document), comment_threads, comments.

### 8.3 Sections

- `POST /documents/:id/sections` → create. Body: `{ orderKey?, kind?, contentJson?, label?, frontmatter? }`.
  - If `orderKey` is omitted, BE generates a key after the current last section.
  - `contentJson` defaults to an empty ProseMirror doc.
  - Runs the content pipeline (§9) before insert so derived fields are set on creation.
- `PATCH /sections/:id` → update any of `contentJson`, `label`, `kind`, `frontmatter`, `orderKey`.
  - Requires `If-Match: <version>` header **or** body field `expectedVersion`.
  - Returns **409 Conflict** if `sections.version !== expectedVersion`. Response body: `{ error: 'version_conflict', currentVersion, currentSection }` so the client can decide to reload.
  - Bumps `version` by 1, updates `updatedAt`, `updatedBy`, runs the content pipeline.
- `DELETE /sections/:id` → hard delete. Cascades to `section_versions`, `section_links` (as source), threads, comments. `section_links` with this id as `targetSectionId` have that FK set to null.
- `POST /sections/:id/versions` → manual snapshot. Body: `{ changeSummary? }`.
  - Reads the current section row, appends a `section_versions` row with `versionNumber = (SELECT COALESCE(MAX(versionNumber), 0) + 1 FROM section_versions WHERE sectionId=:id)`, `changedByType='user'`, `changedBy=:userId`.
  - Does not modify `sections.version`.
- `GET /sections/:id/versions` → list, `versionNumber DESC`.
- `GET /sections/:id/versions/:versionNumber` → single version row.

### 8.4 Comments

- `POST /sections/:id/threads` → create thread + first comment in one tx. Body: `{ body }`. Returns `{ thread, comments: [firstComment] }`.
- `GET /sections/:id/threads` → list threads for the section. Each thread includes `firstComment` and `commentCount`.
- `PATCH /threads/:id` → flip `status`. Body: `{ status: 'open'|'resolved' }`. Sets/clears `resolvedAt` and `resolvedBy`.
- `GET /threads/:id/comments` → list, oldest-first.
- `POST /threads/:id/comments` → append comment. Body: `{ body }`.
- `PATCH /comments/:id` → edit body (author only). Sets `editedAt`.
- `DELETE /comments/:id` → delete (author only). If last comment in thread, thread is deleted too (cascade will handle if the route deletes the thread instead; the route handler picks one path explicitly).

### 8.5 Dev-only

- `POST /dev/seed` → mounted only when `env.DEV_SEED === '1'`. Creates a handful of example docs+sections for the caller's workspace. Idempotent on a per-workspace basis (no-op if workspace already has docs).

## 9. Content derivation pipeline

Every section write (`POST /documents/:id/sections`, `PATCH /sections/:id`) runs these steps inside one Drizzle transaction:

1. **Concurrency check.** For `PATCH`, fetch current `version`; compare against `expectedVersion`. Abort with 409 on mismatch.
2. **Canonicalize `contentJson`.** Deterministic key order, strip `undefined`, no extra whitespace. This canonical form is what gets stored, hashed, and sent back — so round-trips are byte-stable and `contentHash` is stable across no-op saves.
3. **Derive `contentText`** by walking the PM tree and concatenating text nodes. Block separators: `\n\n` between block-level nodes; `\n` between list items and table cells. Custom nodes (`callout`, `embed`) contribute their children's text.
4. **Derive `contentHash`** = SHA-256 hex of canonical JSON bytes.
5. **Extract link tuples** by walking all `docLink` marks attached to text nodes. Mark attrs are `{ docId: string, sectionId?: string }`. Produce a de-duplicated set of `{ targetDocumentId, targetSectionId | null }` tuples. Validate each `targetDocumentId` belongs to the same workspace as the source section's document — silently drop any that don't (defense against cross-workspace copy-paste).
6. **Update `sections`** with `contentJson` (canonical), `contentText`, `contentHash`, `version = version + 1`, `updatedAt = now()`, `updatedBy = userId`, plus whatever else was patched (`label`, `kind`, `frontmatter`, `orderKey`). The `WHERE id = :id AND version = :expectedVersion` guard double-protects against races even if step 1 raced.
7. **Rebuild `section_links`** for this section: `DELETE FROM section_links WHERE sourceSectionId=:id; INSERT ...` for the fresh tuple set.
8. Return the full updated row.

`contentTsv` is a stored generated column; PG maintains it automatically.

Notes:

- The client never sends `contentText`, `contentTsv`, `contentHash`, `version`, or link rows — those are server-owned.
- Canonicalization happens server-side to prevent a malicious or buggy client from producing hash-instability.

## 10. SPA end-state (informational, not in scope of this spec to build)

To make the follow-up implementation spec unambiguous:

- `apps/fe/src/stores/documents.ts` loses `docs`, `order`, `createDoc`, `updateDoc`, `pinDoc`, `deleteDoc`, `renameDoc`, `setEmoji`. It retains UI-ephemeral state only (e.g. `selectedDocumentId`, `selectedSectionId`, `slashMenuOpen`, `bubbleMenuAnchor`).
- `apps/fe/src/lib/seed-docs.ts` is deleted. Dev seed lives on the BE (§8.5).
- Persistent reads/writes go through React Query hooks backed by the Hono RPC client. Debounced section saves call `PATCH /sections/:id` with `expectedVersion`. On 409, the SPA surfaces a "reload to continue" affordance.
- The document-level save-status chip reflects the union of per-section save states (any pending → `Saving…`; all fresh-saved → `Saved · just now`; else `Saved · Xm ago`).
- Title is a document property, not a derived-from-first-H1 field. The H1 heuristic from the prior UI spec goes away.

## 11. Migrations

- Drizzle-kit generates SQL under `apps/be/src/db/migrations/`.
- First migration creates all enums and all non-BetterAuth tables in §6 plus all indexes and the `contentTsv` generated column.
- BetterAuth's migrations run separately (its CLI). Our schema only references `users.id`; we do not redefine it.
- Migration ordering in dev/CI: (1) BetterAuth migrate, (2) app migrate, (3) optional dev seed.

## 12. Quality gates

- `vp check` and `vp test` pass.
- Integration tests hit a **real** PG instance (not mocked): docker-compose-provisioned in CI, or a managed dev database locally. Tests cover at minimum:
  - Signup → workspace + membership auto-created.
  - Unauthenticated request to any non-`/auth`, non-`/health` route returns 401.
  - User A cannot read/mutate user B's document → 404.
  - Create doc → auto-creates one initial section.
  - `PATCH /sections/:id` without `expectedVersion` → 400; with stale version → 409; with correct version → 200 and `version` incremented by 1.
  - Content pipeline: `contentText`, `contentHash`, and `section_links` rows are produced as expected; `contentTsv` is queryable via `to_tsquery`.
  - Manual section version snapshot appends a row with the expected `versionNumber` and does not modify `sections.version`.
  - Delete document cascades to sections, versions, threads, comments, and source-side link rows.
- No route reads request-supplied `contentText`, `contentTsv`, `contentHash`, `version`, or link rows. Enforced by TypeScript input schemas excluding those fields.

## 13. Open flags (non-blocking)

- **PG driver choice on Workers.** Options: Planetscale PG serverless driver, Neon HTTP, or postgres.js over Hyperdrive. All work with Drizzle. Pin at implementation time once the Planetscale connection string is provided.
- **`ydocState` column.** Present but unused. If Yjs persistence later wants an append-only update log rather than a single blob, that is a forward-compatible additive migration, not a v1 redesign.
- **`fractional-indexing` collation.** Default PG collation is fine for the fractional-index alphabet; no custom collation needed.
- **Canonical JSON algorithm.** Use a small hand-rolled canonicalizer (sort object keys, ASCII output, no spaces) rather than pulling a dependency; matches what a future agent author can reproduce.
- **BetterAuth table namespace.** If BetterAuth's table names collide with ours (e.g. `users`), use its Drizzle-adapter table-name override to prefix them (e.g. `auth_users`). FKs in our schema point to whatever name BetterAuth produces.
