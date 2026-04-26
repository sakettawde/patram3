# Documents Persistence — v1

**Date:** 2026-04-26
**Status:** Approved design, ready for implementation planning
**Scope:** D1 schema, Hono BE routes, FE store/query rewire, recovery-code identity flow.

## 1. Goal

Persist a user's documents to D1 so that the same user can resume their work on any browser by entering their **recovery code** (their existing user id). Today, document state lives only in the FE Zustand store seeded from `apps/fe/src/lib/seed-docs.ts`; nothing about documents touches the BE.

## 2. Non-goals (v1)

Explicitly out of scope:

- Sections-as-rows persistence. The earlier `2026-04-24-patram-sections-schema-design.md` spec is superseded by this simpler document-level model. If sections become real later, that is a fresh design.
- Optimistic locking / `version` column. v1 is last-write-wins.
- Manual version snapshots, comments, agent-authored writes.
- Real auth (email/password, OAuth, magic link). Identity remains the existing localStorage-userId scheme, with a recovery-code resume path.
- Document sharing, multi-user docs, presence, real-time collaboration.
- Manual sidebar reordering, pinning. Order is `created_at ASC`.
- Friendly recovery-code format (e.g. `quiet-river-4821`). The 21-char nanoid is the code.

## 3. Identity (recovery code)

- The existing `users.id` (a `nanoid()` from `apps/be/src/routes/users.ts`) is the recovery code. No new column.
- `NamePrompt` (currently inside `apps/fe/src/auth/auth-gate.tsx`) gains a small secondary action: **"Already have a code? Paste it"**. Expanding it reveals a single text field. On submit, the FE calls `GET /users/:id`:
  - 200 → store the id in localStorage, proceed past `AuthGate`.
  - 404 → inline error: "Code not found".
- A small profile/avatar menu in the app shell exposes "Your patram code" with a copy-to-clipboard button. No first-run reveal — the code is opt-in surfacing only.

## 4. Schema (D1, Drizzle)

New table `documents`:

| Column         | Type             | Notes                                         |
| -------------- | ---------------- | --------------------------------------------- |
| `id`           | TEXT PRIMARY KEY | `nanoid(8)`                                   |
| `user_id`      | TEXT NOT NULL    | FK → `users.id` ON DELETE CASCADE             |
| `title`        | TEXT NOT NULL    | default `'Untitled'` at the application layer |
| `emoji`        | TEXT NOT NULL    | default `'📝'` at the application layer       |
| `tag`          | TEXT NULL        | nullable string                               |
| `content_json` | TEXT NOT NULL    | `JSON.stringify(ProseMirror doc)`             |
| `created_at`   | INTEGER NOT NULL | epoch ms                                      |
| `updated_at`   | INTEGER NOT NULL | epoch ms                                      |

Index: `idx_documents_user_created` on `(user_id, created_at)`.

Notes:

- `content_json` is TEXT — D1 has no JSONB. Plenty of headroom under D1's per-row limit.
- `wordCount` and `pinned` (present in the FE `Doc` type today) are dropped. Word count, if surfaced in UI, is derived FE-side from the live editor; pinning is removed entirely along with the Pinned/Recent grouping.
- No `version` column — last-write-wins for v1.

## 5. API (Hono)

All `/documents*` routes require an `X-User-Id` header. Existing `/users/*` routes are unchanged.

### 5.1 Auth middleware

New `apps/be/src/middleware/auth.ts`:

1. Read `X-User-Id` header. Missing → 401 `{ error: 'unauthorized' }`.
2. Look up `users` row by id. Not found → 401 `{ error: 'unauthorized' }`.
3. Attach `{ userId }` to the Hono context.

Applied only to `/documents*`. Matches the project's existing "id-as-credential" style — the same id the FE already uses against `GET /users/:id`.

### 5.2 Routes

- `GET /documents` → array of documents for the caller, sorted by `created_at ASC`. **If the caller has zero rows, insert the seed set in a single transaction and return it.** This is the one-time-seed contract; subsequent calls return whatever the user has.
- `POST /documents` → body `{ title?: string, emoji?: string, tag?: string | null, contentJson?: unknown }`. Missing fields default to: `title='Untitled'`, `emoji='📝'`, `tag=null`, `contentJson={ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }`. Returns the new row.
- `PATCH /documents/:id` → partial of the same field set. Ownership-checked (`user_id === ctx.userId`); non-owners and non-existent ids both return 404 (don't leak existence). Updates `updated_at = Date.now()`. Last-write-wins.
- `DELETE /documents/:id` → 204. Ownership-checked, same 404 rule.

Validation: each route validates inputs (Zod or hand-rolled). `contentJson` is accepted as opaque JSON-serialisable input — the BE does not parse/normalise the ProseMirror tree in v1.

## 6. Server-side seeding

- `apps/fe/src/lib/seed-docs.ts` is deleted.
- A new `apps/be/src/lib/seed-docs.ts` owns the seed list. Shape is adapted to the schema:
  - `created_at` is staggered by small offsets (e.g. 1 ms apart) so the listed order matches insertion order under the `created_at ASC` sort.
  - `updated_at = Date.now()` at insert time.
  - Each row uses a fresh `nanoid(8)` for `id`.
- The seed insert runs inside `GET /documents` only when the row count for `user_id` is zero, in a single transaction, before the response is built.

## 7. FE: store and data flow

### 7.1 Reduced store

`apps/fe/src/stores/documents.ts` is reduced to **UI-ephemeral state only**:

- `selectedId: string | null`
- `selectDoc(id)` action

All other state (`docs`, `order`) and actions (`createDoc`, `updateDoc`, `pinDoc`, `deleteDoc`, `renameDoc`, `setEmoji`) move out. `pinDoc` is deleted (pinning is removed). The remaining mutations move to React Query hooks.

### 7.2 New API client + query hooks

- `apps/fe/src/lib/documents-api.ts` — typed thin client with `list()`, `create(input)`, `update(id, patch)`, `remove(id)`. All methods inject `X-User-Id` from the current user.
- `apps/fe/src/queries/documents.ts` — React Query hooks:
  - `useDocumentsQuery()` — `queryKey: ['documents', userId]`. `staleTime` set so saves don't refetch.
  - `useCreateDoc()` — optimistic insert into the cache.
  - `useUpdateDoc(docId)` — optimistic patch into the cache.
  - `useDeleteDoc()` — optimistic removal.

`useUpdateDoc(docId)` returns a debounced mutator (2000ms). The editor's change handler calls it with whatever changed (`contentJson`, `title`, `emoji`, `tag`). The hook also exposes a `flush()` so blur and `beforeunload` handlers can force-write before unmount.

### 7.3 Editor wiring

The doc editor reads the active doc from `useDocumentsQuery` (selector by `selectedId` from the UI store). On every editor change it calls the per-doc debounced `update` mutator. The save-status chip is driven by the debouncer's state for the active doc:

- a pending debounce or an in-flight mutation → "Saving…"
- otherwise → "Saved · Xm ago" using `updated_at`.

### 7.4 Boot and loading

- `AuthGate` resolves the user → app shell mounts → fires `useDocumentsQuery`.
- While `useDocumentsQuery` is pending, the existing `<BootLoader>` is rendered (already in the codebase per `2026-04-26-boot-loader-design.md`).
- When data lands, sidebar + editor render. `selectedId` defaults to the last doc in the returned list (matching today's `seedDocuments()` behaviour where the most-recent doc is selected).
- Returning users with a localStorage userId but no server docs naturally hit the seed-on-empty path on first load — no explicit migration code is needed.

## 8. Files touched

Backend:

- `apps/be/src/db/schema.ts` — add `documents` table + types.
- `apps/be/drizzle/0001_*.sql` — generated migration.
- `apps/be/src/lib/seed-docs.ts` — new, ported from FE.
- `apps/be/src/middleware/auth.ts` — new.
- `apps/be/src/routes/documents.ts` — new.
- `apps/be/src/index.ts` — mount `/documents`, apply middleware.

Frontend:

- `apps/fe/src/lib/documents-api.ts` — new.
- `apps/fe/src/queries/documents.ts` — new.
- `apps/fe/src/stores/documents.ts` — reduced to UI state.
- `apps/fe/src/stores/documents.test.ts` — updated.
- `apps/fe/src/lib/seed-docs.ts` — deleted.
- `apps/fe/src/auth/use-current-user.ts` — add `useLookupUser(id)` for the code-paste path.
- `apps/fe/src/auth/auth-gate.tsx` — NamePrompt grows the "I have a code" affordance.
- Editor component(s) consuming docs — switch from store to React Query hooks; wire debounced save and `flush()` on blur / `beforeunload`.
- New profile menu component (location: app shell header) — surfaces the user's code with a copy button.

## 9. Tests

Backend:

- Auth middleware: missing header → 401; unknown id → 401; valid id attaches `userId`.
- `GET /documents`: empty user → seeds and returns; non-empty user → returns existing rows in `created_at ASC` order; second call → does not re-seed.
- `POST /documents`: defaults applied for missing fields; row appears in subsequent `GET`.
- `PATCH /documents/:id`: own doc → 200 + `updated_at` advances; other user's doc → 404; non-existent id → 404.
- `DELETE /documents/:id`: own doc → 204; other user's doc → 404.

Frontend:

- `useDocumentsQuery` test: with mocked client, returns seeded list when backend reports empty, then post-create the cache contains the new doc.
- NamePrompt test: code-paste path with 200 → stores id and proceeds; with 404 → renders inline error.
- `documents` store test: only the UI-state surface remains; old action tests removed.

Manual (must run dev server and check in browser):

- Open in a second browser, paste the code from the profile menu, confirm docs appear.
- Edit a doc in browser A, wait > 2 s, reload browser B, edits visible.
- Delete a doc in A, reload B, gone.
- Disconnect network, edit, reconnect → save retries / surfaces an error state (define minimal behaviour during implementation; out of scope to over-engineer).

## 10. Risks and follow-ups

- **Last-write-wins** is acceptable today (no concurrent multi-tab editing flow exists), but if a single user routinely keeps two tabs open, edits will silently clobber. Adding a `version` column is a forward-compatible additive change.
- **Recovery-code discoverability.** Users who don't open the profile menu won't know they have a code. Acceptable for v1; if it becomes a support issue, a one-time post-signup reveal card is a small follow-up.
- **`content_json` as TEXT.** Larger docs (images embedded, very long content) will eventually want chunking. Out of scope; revisit when sections become real or when row size shows up in metrics.
