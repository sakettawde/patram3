# Optimistic `add section` and `delete section` mutations

**Date:** 2026-04-24
**Author:** Saket Tawde (w/ Claude)

## Problem

Today's "add section" and "delete section" flows wait for the server round-trip before the UI updates. The user clicks Ctrl+Enter or the add pill, stares at an unchanged surface for ~100–200 ms, and only then sees the new section appear. Delete has the same latency. Since both mutations are small, structured, and almost always succeed, the waiting gap is pure friction. We want the UI to reflect the user's intent on the same tick they express it.

## Goals

- Inserting or deleting a section updates the UI synchronously with the click/keystroke.
- The newly-created section receives keyboard focus without a visible gap.
- No regressions to per-section save correctness.
- Rollback on server failure is clean: the cache reverts to its prior state.

## Non-goals

- User-visible error UX on failure (toasts/banners). We log to console and silently roll back; we'll revisit when we add a toast system for save failures.
- Undo for deletes. Separate feature.
- Optimistic behavior for `useUpdateSection` (the per-section save path). Out of scope.

## Approach

**Client generates the section ID.** Today the backend assigns the `id` on insert, which forces the FE to wait for the POST to resolve before it knows the new section's identity. By moving id generation to the client (`crypto.randomUUID()`), we get a stable id at `onMutate` time, which means:

- The optimistic row is keyed by its real id. The Tiptap editor mounts once.
- `useSectionSave` — which is keyed by `section.id` — works from the moment the optimistic row renders.
- We avoid any temp-id → real-id swap and the editor remount it would cause.

The alternative (FE-only temp-id swap) was rejected because a user typing into the just-created section during the POST window would lose those keystrokes when the swap remounts the editor.

## Backend changes

**`apps/be/src/services/section-write.ts`**

- Extend `CreateSectionInput` with `id?: string`.
- In `createSection`, when `input.id` is provided, pass it into `.insert(sections).values({ id: input.id, ... })`. Otherwise, let Postgres generate as today.

**`apps/be/src/routes/sections.ts` and `apps/be/src/routes/documents.ts`**

- Extend `createBody` zod schema with `id: z.string().uuid().optional()`.
- Pass `id` through to `createSection`.

**Uniqueness / error handling**

- DB unique constraint on `sections.id` handles the (functionally impossible) v4 UUID collision case by throwing. We don't add special-case 409 handling — collisions at this scale don't happen.
- No idempotency/upsert semantics for retries; mutations aren't auto-retried in the current FE config.

## Frontend changes

### `useCreateSection(documentId)` — `apps/fe/src/queries/sections.ts`

- `mutationFn` input gains a required `id: string` alongside the existing `orderKey`, `kind?`, `contentJson?`, `label?`, `frontmatter?`.
- `onMutate({ id, orderKey, kind, ... })`:
  1. `qc.cancelQueries({ queryKey: qk.document(documentId) })`.
  2. Snapshot: `const previous = qc.getQueryData<DocDetail>(qk.document(documentId))`.
  3. Construct an optimistic `Section`:
     - `id`: client-provided.
     - `documentId`: from the hook arg.
     - `orderKey`, `kind`, `label`, `contentJson`, `frontmatter`: from input, with defaults matching the BE (`kind: "prose"`, empty Tiptap doc, `{}`).
     - `version: 1`.
     - `contentText: ""`, `contentHash: ""` — filled in by the server later.
     - `createdBy`/`updatedBy`: from the `/me` query cache (`qc.getQueryData(qk.me())`). If `/me` is unavailable, fall back to an empty string — the server-returned section will overwrite this in `onSuccess`.
     - `createdAt`, `updatedAt`: `new Date().toISOString()`.
  4. Write `{ ...previous, sections: [...previous.sections, optimistic].sort(byOrderKey) }` into the cache.
  5. Return `{ previous }` as context.
- `onError(err, _, ctx)`: if `ctx?.previous`, restore via `qc.setQueryData(qk.document(documentId), ctx.previous)`; `console.error("useCreateSection failed", err)`.
- `onSuccess(real)`: replace the optimistic row matched by `id` with `real`. Re-sort defensively. This picks up server-canonical `contentHash`, `contentText`, and timestamps.

### `useDeleteSection({ sectionId, documentId })`

- `onMutate`:
  1. Cancel the doc detail query.
  2. Snapshot.
  3. Filter `sections` to exclude `sectionId`.
  4. Return `{ previous }`.
- `onError`: restore + `console.error("useDeleteSection failed", err)`.
- `onSuccess`: no-op (cache already filtered).

### Call sites

**`SectionList.insertAfter` — `apps/fe/src/components/doc/section-list.tsx`**

- Generate `const id = crypto.randomUUID()` at call time and pass to `create.mutate({ id, orderKey })`.
- Remove the `if (create.isPending) return;` guard. It exists today only to prevent concurrent creates from computing the same `orderKey`. With optimistic insert, each subsequent `insertAfter` sees the updated cache and `keyBetween` produces a distinct key.

**Auto-focus the new section**

- `SectionList` holds a small `pendingFocusId: string | null` state.
- `insertAfter` sets `pendingFocusId = id` immediately after calling `create.mutate`.
- The existing `onEditorReady(id, ed)` callback in `SectionBlock` fires when Tiptap is mounted. When `id === pendingFocusId`, call `ed.commands.focus("start")` and clear `pendingFocusId`.
- This works identically for both the Ctrl+Enter keyboard path and the Add-Section pill path since both go through `insertAfter`.

## Known risk: PATCH before POST

If a user starts typing into a just-created section, `useSectionSave` may fire a debounced PATCH referencing an `id` the server hasn't yet seen. Mitigation:

- `useSectionSave`'s `IDLE_DEBOUNCE_MS` is 2000 ms — well above typical LAN POST RTT (<100 ms), so the PATCH fires long after the POST has returned in the common case.
- Requests go over the same HTTP connection and are generally ordered.

This is acceptable for v1. If it proves flaky in practice, the follow-up is to gate PATCHes in `useSectionSave` until the corresponding create has settled (e.g., tracked via a `pendingCreates: Set<id>` in the UI store, populated by `onMutate` and cleared in `onSuccess`/`onError`). Not speculatively fixed.

## Testing

**FE — `apps/fe/src/queries/sections.test.tsx`**

- `useCreateSection`:
  - Optimistic row is visible in the cache synchronously after `mutate({ id, orderKey })`, before the mocked POST resolves.
  - On server success, the optimistic row is replaced by the server-returned Section (id matches, `contentHash` present, etc.).
  - On server error, cache is restored to its pre-mutation snapshot.
- `useDeleteSection`:
  - Section is removed synchronously after `mutate()`.
  - On server error, the section reappears (cache restored).

**BE — `apps/be/src/routes/sections.test.ts`**

- POST `/documents/:docId/sections` with a client-supplied `id` persists that id.
- POST without `id` still generates one server-side (regression).
- POST with a non-UUID `id` returns a 400 from the zod validator.

## File-by-file plan

- `apps/be/src/services/section-write.ts` — add optional `id` to `CreateSectionInput`; pass through to insert.
- `apps/be/src/routes/sections.ts` — add `id` to `createBody`; forward to `createSection`.
- `apps/be/src/routes/documents.ts` — same.
- `apps/be/src/routes/sections.test.ts` — add the three test cases above.
- `apps/fe/src/queries/sections.ts` — rewrite `useCreateSection` and `useDeleteSection` with `onMutate`/`onError`/`onSuccess` as specified; require `id` in `CreateSectionInput`.
- `apps/fe/src/queries/sections.test.tsx` — rewrite tests to cover optimistic + rollback cases.
- `apps/fe/src/components/doc/section-list.tsx` — generate UUID, remove pending guard, add `pendingFocusId` focus plumbing.
- `apps/fe/src/components/doc/section-block.tsx` — no changes expected; `onEditorReady` already exists.
