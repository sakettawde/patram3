# Patram — SPA ↔ BE wiring (v1)

**Date:** 2026-04-24
**Status:** Approved design, ready for implementation planning
**Scope:** Wire `apps/fe` to the Hono BE on `feat/sections-persistence`. Auth screens + router gate, Hono RPC + React Query, per-section Tiptap editors with debounced writes and optimistic-concurrency UX, save-status rollup, retire the seed-docs path, and re-home document metadata to the BE. FE-only changes; the BE surface is taken as already-shipped.
**Supersedes (partially):**

- §5 and §6 (sidebar Pinned; topbar Pin star) and §9 (in-memory Zustand + seed + localStorage) of [2026-04-23-patram-document-ui-design.md](./2026-04-23-patram-document-ui-design.md).
- §10 of [2026-04-24-patram-sections-schema-design.md](./2026-04-24-patram-sections-schema-design.md) — this spec is the concrete realization of that SPA end-state.
- The H1-derives-title heuristic from the prior UI spec goes away: title is a first-class document property.

## 1. Goal

Replace the SPA's in-memory Zustand store and `seed-docs.ts` with a real, authenticated, per-section-persisted experience backed by the Hono/Drizzle/BetterAuth BE. Every edit hits the wire with optimistic concurrency. The UI treats sections as first-class, user-visible units without cluttering the writing surface.

## 2. Non-goals (v1 of wiring)

Explicitly out of scope — must not be built in this pass:

- Comments and threads. Routes exist; no UI this pass.
- Manual section version snapshots (`POST/GET /sections/:id/versions`). No history panel, no restore.
- Cross-section selection or cross-section caret behavior beyond arrow-up/arrow-down focus routing.
- Drag-to-reorder sections and section reorder via any path. Sections are created in insertion order and stay there for v1.
- Split-current-section-at-caret. Section creation is append-only.
- Forgot-password, email verification, OAuth.
- Workspace invitation / member management UI / workspace switcher.
- Export (PDF/MD/HTML), sharing, permissions UI.
- Real search beyond the existing stub input.
- Pagination or infinite scroll on `GET /documents`.
- Cross-tab real-time sync / Yjs. `ydocState` stays unpopulated.
- Migration from pre-existing `localStorage` state. The old `VITE_PERSIST` path and its on-disk blob are discarded on first load.

## 3. Foundational decisions

- **Sections are visible, persistent, per-section Tiptap instances.** One Tiptap per section, stacked vertically inside the doc surface.
- **Section chrome is quiet.** No persistent gutter. Hover/focus reveals a small top-right toolbar (save pip + `⋯` menu) and reveals an `+ Add section` pill in the gap below the section.
- **Section creation is append-only.** `Ctrl/Cmd+Enter` from inside a section, or clicking the pill in a gap, inserts a new empty section after the current one.
- **Section deletion is menu-only.** `⋯ → Delete section`, disabled when only one section remains.
- **Saves are pessimistic for content, optimistic for metadata.** Content (`sections.contentJson`) waits for the server before updating `version`/`contentHash`. Metadata (document title, emoji, status; section label/kind later) write-through the cache immediately and roll back on failure.
- **Optimistic concurrency is surfaced, not hidden.** On `409` from `PATCH /sections/:id` the local editor content is preserved, a banner appears on the conflicted section, and the user chooses between `Copy my edits` (plaintext to clipboard, then reload) or `Discard & reload`.
- **Auth has dedicated routes.** `/sign-in`, `/sign-up`. Everything else is behind an authenticated layout that redirects on 401.
- **Title is a document property.** Rendered as an independent H1-styled input above the sections list; no longer derived from the first heading in content.
- **React Query is the cache.** Zustand shrinks to UI-ephemeral state only.

## 4. Routes and auth gate

### 4.1 Route tree

```
routes/
  __root.tsx                 # unchanged structurally
  _unauth.tsx                # layout; redirects to "/" if /me succeeds
    _unauth/sign-in.tsx
    _unauth/sign-up.tsx
  _authed.tsx                # layout; beforeLoad GET /me; 401 -> redirect("/sign-in")
    _authed/index.tsx        # renders AppShell
```

The two layouts (`_unauth`, `_authed`) are Tanstack Router pathless layouts. `_authed.beforeLoad` fetches `/me` via React Query's `ensureQueryData` so the cache is warm when `AppShell` mounts. The `/me` response (`{ user, workspace, role }`) is put on the router context; components consume it via the `useMe()` hook (which reads the same cache).

### 4.2 Sign-in / sign-up

- Dedicated, full-page forms, brand lockup at top, lagoon-tint card on the page-gradient background.
- **Sign-in** fields: email, password. Submit → `POST /auth/sign-in/email` (BetterAuth). On 200 → `router.navigate({ to: "/" })`. On error → inline error under the form (`"Wrong email or password"` for 401; `"Something went wrong"` for 5xx; field-level for validation).
- **Sign-up** fields: display name, email, password. Submit → `POST /auth/sign-up/email` with `{ name, email, password }`. On 200 the BetterAuth session is already set (auto-sign-in is configured on the BE) → navigate to `/`. BetterAuth's post-signup hook on the BE creates the workspace + owner membership in the same tx, so the first `/me` call succeeds.
- Password policy: BetterAuth default (8-char minimum).
- No "forgot password" link (cut from v1 — BE has no email delivery).
- Sign-out: `POST /auth/sign-out`, then `router.invalidate()` forces `_authed.beforeLoad` to re-run, which bounces to `/sign-in`.

## 5. API layer

### 5.1 Client

- `apps/fe/src/lib/api.ts`:
  - Exports `api = hc<AppType>(baseUrl, { init: { credentials: "include" } })`.
  - `AppType` imported type-only from `../../../be/src/index.ts` (workspace is already wired via pnpm; no package boundary needed).
  - `baseUrl` resolution: `import.meta.env.VITE_API_URL ?? ""`. Empty string means same-origin; in dev, Vite proxies `/api/*`, `/auth/*`, `/me`, `/documents`, `/sections`, `/threads`, `/comments`, `/dev/*`, `/health` → `http://localhost:8787` (`wrangler dev`). Proxy config added to the Vite config.
- Response handling utility: a thin `unwrap(res)` that throws a typed `ApiError` with `{ status, body }`. `ApiError.is409(body)` returns `true` iff `body.error === "version_conflict"`.

### 5.2 Query keys

`apps/fe/src/lib/query-keys.ts`:

```ts
export const qk = {
  me: ["me"] as const,
  documentsList: (params: { status?: DocStatus }) => ["documents", "list", params] as const,
  document: (id: string) => ["documents", "detail", id] as const,
};
```

### 5.3 Hooks

`apps/fe/src/queries/` — one file per resource:

- **me.ts:** `useMe()`, `useSignIn()`, `useSignUp()`, `useSignOut()`. `useMe` has `staleTime: Infinity` and `retry: false`. Sign-in/up/out mutations invalidate `qk.me` and `['documents']`.
- **documents.ts:** `useDocumentsList({ status? })`, `useDocument(id)`, `useCreateDocument()`, `useUpdateDocument()`, `useDeleteDocument()`.
  - `useDocument(id)` calls `GET /documents/:id` which returns `{ document, sections }`; the hook exposes both.
  - `useUpdateDocument()` is optimistic: on `onMutate` it snapshots and patches both `qk.document(id)` and the row inside `qk.documentsList(*)`; on `onError` it rolls back; on `onSuccess` it writes the server row through. The mutation reads the current `document.updatedAt` from cache and sends it as `expectedUpdatedAt`.
  - `useCreateDocument()` POSTs, then seeds `qk.document(newId)` from the response and prepends the doc into `qk.documentsList({})`. Navigates to the new doc.
  - `useDeleteDocument()` DELETEs, then drops the doc from all list caches and nukes `qk.document(id)`.
- **sections.ts:** `useCreateSection(docId)`, `useUpdateSection(sectionId)`, `useDeleteSection(sectionId)`.
  - `useUpdateSection` is the hot path. Input: `{ contentJson?, label?, kind?, frontmatter?, orderKey?, expectedVersion }`. On success, patches the specific section row inside `qk.document(docId)` with the returned `{ version, contentHash, updatedAt, contentText }` — content is not re-initialized into the editor. On 409, throws so the caller can show the banner.
  - `useCreateSection` optimistically inserts a placeholder section with a `pendingId` into the doc cache; on success, replaces it with the real row; on error, removes it.
  - `useDeleteSection` removes the section from the doc cache on success (no optimistic delete — cheap round-trip, cleaner rollback story).

Document and section mutations use `setQueryData` to patch caches precisely; no broad `invalidateQueries` on those paths, to avoid clobbering a user's mid-flight edits in a parallel section. Auth mutations (sign-in/up/out) do invalidate caches, since identity changes.

## 6. Section editor architecture

### 6.1 Rendering tree

```
DocSurface(documentId)
├── DocHeader(document)
│    ├── DocEmojiButton        # existing palette, writes via useUpdateDocument
│    ├── DocTitleInput         # contentEditable plain text input, Fraunces 38px
│    └── DocMeta               # "Edited Xm ago · N sections · N words"
└── SectionList(document, sections)
     ├── SectionBlock(section)    (for each section in orderKey order)
     │    ├── SectionToolbar     # top-right; appears on hover/focus
     │    │    ├── SaveStatePip
     │    │    └── SectionMenu   # ⋯ dropdown: Delete section (disabled if solo)
     │    ├── SectionConflictBanner  # visible only when local state = "conflict"
     │    ├── SectionEditor     # one <EditorContent/> per section
     │    └── SectionBubbleMenu # per-instance, scoped to this section
     └── AddSectionPill(afterSectionId?: string)   # appears after every section incl. last
```

### 6.2 SectionBlock internals

- `useEditor` keyed on `section.id`. Initial `content = section.contentJson`. Extensions come from `buildExtensions()` (same set as today, minus the title-deriving concerns).
- **Local per-section save state machine:**
  - `idle` (no local changes since mount/last save)
  - `dirty` (onUpdate fired, timer pending)
  - `saving` (mutation in flight)
  - `saved` (200 within last 1.5s; then fades to `idle`)
  - `error` (network/5xx — Retry button in toolbar)
  - `conflict` (409 — banner visible, editor content preserved)
- **Timer:** 600ms of idle OR editor `blur` fires the save. Blur-triggered save still passes through the same mutation, so state transitions are the same.
- **Mutation body:** `{ contentJson: editor.getJSON(), expectedVersion: lastSeenVersion }`. `lastSeenVersion` starts at `section.version` and is updated on each successful `setQueryData` patch.
- **Focus routing:** arrow-down at the editor's doc end moves focus to the next section's first line; arrow-up at doc start to previous section's last line. Implemented via a tiny helper that reads `editor.state.selection` + `editor.state.doc.content.size` and emits a `focusSection(id, "start"|"end")` signal to a sibling.
- **Focus rail:** when the section editor has focus, a 1px `--lagoon` left rail appears on the block. CSS-only; no layout shift.
- **Ctrl/Cmd+Enter:** Tiptap keymap binding on each editor. Prevents default, calls `insertSectionAfter(section.id)` (→ `useCreateSection`). On success, focuses the new section's editor at its start.
- **Slash + bubble menus:** unchanged from current; they're per-editor-instance by construction.

### 6.3 SectionToolbar and SaveStatePip

- Toolbar positioned absolutely at the top-right of the section block; `opacity: 0` by default, `opacity: 1` on `:hover` or `:focus-within` or when state is one of `saving | error | conflict` (so non-idle states are always visible).
- `SaveStatePip` dot states:
  - `idle`: transparent dot (takes space, no ink).
  - `dirty`: 6px amber dot (`#d9a441` or similar; picked at implementation time from existing tokens).
  - `saving`: 10px lagoon spinner.
  - `saved`: 10px lagoon check, fades after 1500ms to `idle`.
  - `error`: 6px red dot + tooltip "Save failed — click to retry" (click triggers the mutation again with the last payload).
  - `conflict`: 6px amber ring (hollow) + tooltip "This section changed on the server" (click scrolls the banner into view).
- Accessible: state is also announced via an `aria-live="polite"` region attached to the toolbar.

### 6.4 AddSectionPill

- A 24px-tall pill with `+ Add section` label. Lagoon outline, transparent fill. Appears on hover of the 24px gap below each section and below the last section.
- Click → `useCreateSection(docId)` with `{ afterSectionId: section.id }`. BE appends after that section's orderKey.
- Keyboard equivalent: `Ctrl/Cmd+Enter` from within any section.
- After create, focus is moved to the new section's editor (start position).

### 6.5 SectionMenu (⋯)

- Built on shadcn `DropdownMenu`. Items:
  - **Delete section** — disabled when `sections.length === 1`, with tooltip `"A document needs at least one section"`. On click, a small confirm popover (`Delete this section?` / `Cancel` · `Delete`) — no modal. On confirm → `useDeleteSection(section.id)`.
- Reorder items (Move up / Move down) are **not** in v1. Design leaves room to add them later without restructuring the menu.

### 6.6 SectionConflictBanner

- Appears inline at the top of the section block whenever state is `conflict`.
- Copy:
  > **This section was changed elsewhere.**
  > Your unsaved edits are kept locally until you decide.
- Two buttons:
  - **Copy my edits** — writes the editor's current plaintext (same extraction the BE uses — walk PM tree, `\n\n` between blocks, `\n` between list items/table cells; we reuse `apps/be/src/lib/content/extract-text.ts` logic by copy or by a shared pure util under `apps/fe/src/lib/`) to the clipboard, then fetches the server's canonical section via `GET /documents/:id`, replaces the editor content, resets `lastSeenVersion`, clears the banner.
  - **Discard & reload** — refetches + replaces + resets, without the clipboard step.
- No auto-merge, no diff view. Both buttons leave the section in `idle` state.

## 7. Save-status rollup (topbar chip)

`SaveStatus` is driven by a derived selector over every visible section's local state plus in-flight document metadata mutations:

- Any section in `saving` OR any doc-metadata mutation in flight → `Saving…` (spinner).
- Else, any section in `error` or `conflict` → `Unsaved changes` pill (red-tint). Click = scroll to first offending section.
- Else, any section in `dirty` → `Editing…` (subtle, no spinner).
- Else → `Saved · <relative>` where `relative = max(updatedAt over sections + document.updatedAt)`, refreshed once per minute via a timer (already present in `SaveStatus`).

The derivation lives in a `useSaveRollup(documentId)` hook near the topbar; sections publish their local state to a lightweight Zustand slice (one entry per mounted section id) so the rollup can read from one place.

## 8. Document metadata

- **Title:** `DocTitleInput` is a `contentEditable` single-line div styled as Fraunces 38px with the existing placeholder. Debounced PATCH (600ms or blur). `PATCH /documents/:id` requires `expectedUpdatedAt`; on 409, silent refetch of the server value and a toast `"Document metadata was updated — refreshed"`. The input only re-applies the server value when it does **not** currently have focus — we never stomp a user's in-progress typing. If focus is in the input at refetch time, the toast is shown and the server value is applied on blur.
- **Emoji:** existing palette writes via `useUpdateDocument`. Optimistic.
- **Status:** new `⋯ → Status` submenu in the topbar (Draft / Review / Published / Archived). Optimistic.
- **Overflow `⋯`:** Delete (confirm), Status submenu, Change icon (opens the emoji palette).
- **Pin:** removed. The topbar pin star is gone; `Pinned` section in the sidebar is gone. Both were client-only and have no BE field.

## 9. Sidebar

- **Brand row** — unchanged.
- **Search input** — still a stub; no query yet.
- **+ New document** — calls `useCreateDocument()` (BE auto-creates one initial section) and navigates to the new doc.
- **Status filter pill row** — `All / Draft / Review / Published / Archived`. Reads and writes a UI-state slice; the active filter becomes a query param on `useDocumentsList({ status })`.
- **Recent documents** — the list, ordered by `updatedAt DESC` (BE default sort). Each row shows emoji + title + a subtle relative-time chip on the right. No pin star. No count chip (count is implicit from list length).
- **Footer** — user chip (name, email from `/me`), theme toggle, **Sign out** button. In dev builds only (`import.meta.env.DEV`), an additional **Seed sample docs** button calls `POST /dev/seed` and invalidates `useDocumentsList`.

## 10. State: Zustand slimmed down

`apps/fe/src/stores/ui.ts` (renamed from `stores/documents.ts`):

```ts
type UiState = {
  selectedDocumentId: string | null;
  selectedSectionId: string | null;
  sidebarCollapsed: boolean;
  statusFilter: DocStatus | "all";

  sectionSaveStates: Record<string, SectionSaveState>; // for topbar rollup
  setSectionSaveState: (id: string, s: SectionSaveState) => void;
  clearSectionSaveState: (id: string) => void;

  selectDocument: (id: string | null) => void;
  selectSection: (id: string | null) => void;
  toggleSidebar: () => void;
  setStatusFilter: (s: DocStatus | "all") => void;
};
```

No `docs`, no `order`, no `createDoc`, no `updateDoc`, no `pinDoc`, no `renameDoc`, no `setEmoji`, no `selectedId` under the old name. `selectedDocumentId` is kept in sync with the router's URL params.

`apps/fe/src/lib/seed-docs.ts` is deleted.

`documents.test.ts` is deleted (its assertions all concern the old store). Replaced by query-hook and save-rollup tests.

## 11. Component delta (summary)

New:

- `routes/_unauth.tsx`, `routes/_unauth/sign-in.tsx`, `routes/_unauth/sign-up.tsx`.
- `routes/_authed.tsx`, `routes/_authed/index.tsx` (wraps AppShell).
- `components/auth/auth-layout.tsx`, `components/auth/sign-in-form.tsx`, `components/auth/sign-up-form.tsx`.
- `components/doc/doc-header.tsx`.
- `components/doc/section-block.tsx`, `components/doc/section-toolbar.tsx`, `components/doc/section-menu.tsx`, `components/doc/save-state-pip.tsx`, `components/doc/add-section-pill.tsx`, `components/doc/section-conflict-banner.tsx`.
- `lib/api.ts`, `lib/query-keys.ts`, `lib/extract-section-text.ts` (shared with BE's extract-text logic; small pure util).
- `queries/me.ts`, `queries/documents.ts`, `queries/sections.ts`.
- `stores/ui.ts` (renamed).

Changed:

- `components/app-shell.tsx` — reads `useDocument(selectedDocumentId)` instead of Zustand; no-selection state stays.
- `components/doc/doc-surface.tsx` — renders `<DocHeader/>` + `<SectionList/>` instead of one editor.
- `components/editor/*` — stays, but no longer derives title; `editor.tsx` becomes the inner piece inside `SectionBlock`.
- `components/topbar.tsx` — pin removed; status submenu added; delete wired to BE.
- `components/save-status.tsx` — accepts a derived rollup state (`"saving" | "dirty" | "error" | "saved"`) plus a `savedAt`.
- `components/sidebar/*` — Pinned section removed; status filter added; dev seed button in footer.
- `router.tsx`, `routes/__root.tsx`, `routes/index.tsx` — restructured per §4.1.
- `vite.config.ts` — dev proxy for the BE.

Deleted:

- `lib/seed-docs.ts`.
- `stores/documents.ts` (replaced by `stores/ui.ts`).
- `stores/documents.test.ts`.
- `components/app-shell.test.tsx` if its assertions no longer hold; rewrite to match the new shell.

## 12. Testing

All FE tests use **MSW** to fake the BE contract, derived from `AppType` where feasible (handlers hand-written; contract drift is caught by TS). No real BE, no real DB from FE tests.

- **Query hooks:** `useDocumentsList`, `useDocument`, `useCreateDocument`, `useUpdateDocument`, `useUpdateSection` (success, 409, 500), `useDeleteSection`. Cache patches verified after mutations.
- **SectionBlock save state machine:** simulate onUpdate → dirty → saving → saved → fade to idle; 500 → error + retry; 409 → conflict + banner shown.
- **Conflict banner flow:** Copy my edits writes clipboard (jsdom `navigator.clipboard` stub), fetches, replaces editor, resets state; Discard & reload skips clipboard.
- **Focus routing:** arrow-down at end of section A focuses section B's start; arrow-up at start of section B focuses section A's end.
- **Save rollup:** all idle → `Saved · ...`; one dirty → `Editing…`; one saving → `Saving…`; one error → `Unsaved changes`; mixed → follows priority order.
- **Auth flow (RTL):** unauthenticated route load → redirects to `/sign-in`; fill form → app mounts; sign-out → bounces back.
- **Smoke (RTL):** mount `AppShell`, create doc, type in a section, see save pip cycle, click `+ Add section`, new section appears and focuses.

## 13. Dev loop and proxy

- `vp run be#dev` on `apps/be` starts `wrangler dev` on port 8787.
- `vp dev` on `apps/fe` starts Vite on port 3000 with a proxy for `/me`, `/documents`, `/sections`, `/threads`, `/comments`, `/auth`, `/dev`, `/health` → `http://localhost:8787`.
- Session cookies work because everything is same-origin from the browser's POV.
- `VITE_API_URL` is empty in dev; set at deploy time if FE and BE diverge.

## 14. Quality gates

- `vp check` and `vp test` pass in `apps/fe`.
- A manual smoke after implementation:
  - Sign up a new account → lands in the app with an empty `Recent documents` list.
  - Click + New document → lands on the new doc; one section is present; type into it; save pip cycles; reload the page → content persists.
  - Click + Add section; type; save; delete the second section; only one remains, delete is disabled.
  - Open the same doc in a second tab, edit a section there, then edit the same section in the first tab → first tab shows the conflict banner.
  - Change title, emoji, status; reload; metadata persists.
  - Sign out → redirected to `/sign-in`.

## 15. Open flags (non-blocking)

- **`AppType` import path.** If the BE app type proves painful to import across the monorepo (module resolution quirks), the fallback is to `export type AppType` from a small BE entry with `typeof app` and re-export from a shim in `apps/fe`. No runtime dependency either way.
- **Clipboard copy on conflict.** We use the BE's plaintext extraction rules so user-visible copy exactly matches what would have been saved. If the two extraction paths drift, the bug is cosmetic (the clipboard text differs slightly from `contentText`), not data loss.
- **Focus routing edge cases.** Within tables or code blocks at section boundaries, arrow-up/down semantics are PM-native; we only route at true-doc-edge selections.
- **Tailwind / shadcn primitives for auth forms.** `shadcn@latest add form label` if `form` wasn't installed earlier. No new design tokens.
- **Dev proxy paths.** If the BE grows more root paths (e.g. a `/ws` later), the proxy list needs a refresh. A catch-all `/*` proxy is tempting but would break Vite's own asset serving — prefer an explicit allowlist.
