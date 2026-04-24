# Seamless, Offline-Friendly Section Saves

**Status:** Design approved
**Date:** 2026-04-24
**Scope:** Replace the current section-save pipeline with a calm, last-writer-wins flow backed by a localStorage safety net. Sideline optimistic version checking until post-MVP.

## Problem

The current save loop in [apps/fe/src/components/doc/section-block.tsx](../../../apps/fe/src/components/doc/section-block.tsx) fires a save 600ms after any keystroke, sends an `expectedVersion`, and handles 409 conflicts with a 5-attempt retry loop that silently adopts the server version. In practice this:

- Feels twitchy: the "saving" pip flashes on every short pause.
- Surfaces rare but real failures when conflict retries run out or when races produce stale version refs.
- Couples a future-facing feature (optimistic locking) to the MVP editing experience without user-facing versioning UI to justify the cost.

## Goal

Saves should feel invisible. A user typing, pausing, clicking into another section, closing the tab, or reloading should never lose work and should never see conflict errors. Versioning infrastructure stays in place but is no longer on the write path.

## Non-goals

- Real offline editing with queue drain on reconnect.
- Cross-tab coordination via `BroadcastChannel`.
- Version history UI or CRDT-style merge.
- Any change to section snapshot endpoints (`POST/GET /sections/:id/versions`).

## Approach

Option C from brainstorming: invisible saves in the foreground, localStorage as the safety net. Last-writer-wins at the server.

## Backend changes

**[apps/be/src/routes/sections.ts](../../../apps/be/src/routes/sections.ts)**

- Change `patchBody.expectedVersion` from required to `.optional()`.
- In the PATCH handler, only run the version-conflict branch when `expectedVersion` is present. Otherwise always apply.
- `version` column continues to increment on every successful update.

**[apps/be/src/services/section-write.ts](../../../apps/be/src/services/section-write.ts)**

- `UpdateSectionInput.expectedVersion` becomes `number | undefined`.
- The `if (current.version !== input.expectedVersion)` check and the post-update re-read both guard on `expectedVersion !== undefined`.
- When omitted, the `UPDATE ... WHERE id = ? AND version = ?` becomes `UPDATE ... WHERE id = ?` and no `VersionConflictError` is thrown.

No migration. No change to `sectionVersions` / snapshot endpoints. Existing clients that send `expectedVersion` continue to get the old behavior (back-compat preserved).

## Frontend changes

### New: `apps/fe/src/lib/section-save-store.ts`

Thin typed wrapper around `localStorage`. Key format `patram:section:<id>`.

```ts
type LocalSnapshot = {
  contentJson: JSONContent;
  savedAt: number; // ms epoch
};

getLocalSnapshot(sectionId: string): LocalSnapshot | null;
putLocalSnapshot(sectionId: string, snap: LocalSnapshot): void;
clearLocalSnapshot(sectionId: string): void;
```

All three operations wrapped in `try/catch`. Any failure (quota exceeded, unavailable storage, JSON parse failure on read) is silently swallowed — callers get `null` on read, no-op on write.

### New: `apps/fe/src/lib/use-section-save.ts`

A hook owning the full save lifecycle for one section.

```ts
export function useSectionSave({
  section,
  documentId,
  editor,
}: {
  section: Section;
  documentId: string;
  editor: TEditor | null; // passed via React state, not a ref — the hook
  // registers/tears down editor listeners when editor changes
}): {
  state: SectionSave;
  flushNow: () => Promise<void>;
  initialContent: JSONContent; // resolved from server-or-local at mount; see below
};
```

`SectionBlock` lifts the Tiptap editor instance into state:

```tsx
const [editor, setEditor] = useState<TEditor | null>(null);
const { state, flushNow, initialContent } = useSectionSave({ section, documentId, editor });
// <Editor onReady={setEditor} initialContent={initialContent} ... />
```

**Internal state machine** (reuses `SectionSave` from
[apps/fe/src/lib/section-save-state.ts](../../../apps/fe/src/lib/section-save-state.ts), minus `conflict`):

```
idle ──edit──▶ dirty ──(2s idle)──▶ saving ──ok──▶ saved ──(fade)──▶ idle
                 │                     │
                 └──flushNow()─────────┘
                                       └──err──▶ error (keeps retrying, backoff)
```

**Trigger matrix:**

| Trigger                  | Action                                          |
| ------------------------ | ----------------------------------------------- |
| `editor.onUpdate`        | Mirror to localStorage, start/reset 2s debounce |
| 2s idle timer fires      | `flushNow()` if dirty                           |
| `editor.on('blur', ...)` | `flushNow()` (immediate)                        |
| Component unmount        | `flushNow()` (immediate; fire-and-forget)       |
| `window.beforeunload`    | `navigator.sendBeacon` with current JSON        |

**Serialization:** at most one PATCH in flight per section. If `flushNow()` is called while a save is in flight, set a `pendingResaveRef` flag; the in-flight save's `.finally` re-triggers `flushNow()` when it sees the flag.

**Retry loop:** on failure, schedule another attempt with exponential backoff: `1s, 2s, 4s, 8s, 16s, 30s, 30s, ...`. Errors classified:

- Network / 5xx → silent retry; pip stays in `dirty` for first 3 attempts, then transitions to `error` while still retrying.
- 4xx other than 409 → `error` state, stop auto-retrying, allow manual retry via pip click. Covers 404 (section deleted) / 401 (auth expired).
- 409 → cannot happen (no `expectedVersion` sent); if it does, treat as 4xx hard error.

**"Saving" pip grace period:** the hook exposes state transitions, but the pip (see below) waits 400ms after `saving` begins before rendering the spinner. Saves faster than 400ms produce no visible flicker.

### Updated: `apps/fe/src/components/doc/section-block.tsx`

Shrinks to ~80 lines. Removes `versionRef`, `saveInFlightRef`, `pendingResaveRef`, the `useReducer(reduceSectionSave, …)` call, the `attempt(retriesLeft)` loop, the 409 branch, the hand-rolled debounce timer, and the fade timer. The reducer moves inside `useSectionSave`. Replaced at the call site with:

```tsx
const [editor, setEditor] = useState<TEditor | null>(null);
const { state, flushNow, initialContent } = useSectionSave({ section, documentId, editor });
// <Editor onReady={setEditor} initialContent={initialContent} … />
// unmount flush handled inside the hook via useEffect cleanup
```

**localStorage recovery on mount:**

`useSectionSave` computes `initialContent` synchronously on first call, before the editor is created, so there is no flash of server content when local is fresher. Logic:

```
snap = getLocalSnapshot(section.id)
if (!snap)                                         → initialContent = section.contentJson
else if (snap.savedAt > section.updatedAt_ms)      → initialContent = snap.contentJson
                                                     and mark state dirty so the first
                                                     idle tick (or blur) flushes local → server
else                                               → clearLocalSnapshot(section.id)
                                                     initialContent = section.contentJson
```

Editor listener registration (onUpdate, blur) runs in a separate effect gated on `editor !== null`, so it attaches once the editor is ready and detaches if the editor is replaced.

### Updated: `apps/fe/src/components/doc/save-state-pip.tsx`

- Remove the `conflict` case (unreachable).
- Delay rendering the `saving` spinner by 400ms using a `useEffect` timer keyed on `state.status`.
- Keep existing semantics for `saved` / `error`.

### Updated: `apps/fe/src/lib/section-save-state.ts`

- Remove `conflict` from the `SectionSave` union and the reducer.
- Optional: add `attempts: number` to `error` state so the pip/debug can reflect "still retrying".

### Updated: `apps/fe/src/queries/sections.ts`

- `UpdateSectionInput.expectedVersion` becomes optional.
- No other change. The mutation hook still merges server response into the query cache.

### Unchanged

- [apps/fe/src/components/doc/section-list.tsx](../../../apps/fe/src/components/doc/section-list.tsx): sections are all mounted as a list; focus movement triggers blur on the outgoing editor, which triggers `flushNow()`. No list-level orchestration needed.
- Snapshot endpoints (`/sections/:id/versions` POST/GET) on both BE and FE.

## Error handling summary

| Condition                       | Behavior                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Network down, request hangs     | Silent retry with exponential backoff, snapshot in localStorage                                                                      |
| 5xx response                    | Same as above                                                                                                                        |
| 4xx (not 409)                   | Error pip, stop auto-retry, snapshot preserved, manual retry on click                                                                |
| Tab closed with dirty buffer    | `sendBeacon` fires; on next mount, localStorage seeds editor                                                                         |
| Reload mid-save                 | On mount, localStorage `savedAt` > server `updatedAt` → seed and flush                                                               |
| localStorage unavailable / full | Silent; no safety net, saves still function normally                                                                                 |
| Clock skew (local clock behind) | Worst case: user's own fresher edits are treated as stale → lost. Acceptable for MVP; post-MVP we upgrade to content-hash comparison |

## Testing

New / updated test files, all runnable via `vp test`.

1. **`apps/fe/src/lib/section-save-store.test.ts`** (new)
   - `put` then `get` round-trips the snapshot.
   - Keys are scoped by section id (`patram:section:<id>`).
   - Mocking `localStorage.setItem` to throw `QuotaExceededError` results in silent no-op.
   - Malformed JSON in storage yields `null` from `get` (no throw).

2. **`apps/fe/src/lib/use-section-save.test.tsx`** (new)
   - Rendered with a test harness component that creates a real Tiptap editor in a JSDOM environment.
   - Typing fires exactly one PATCH 2000ms after the last keystroke.
   - Rapid typing while a save is in flight queues one follow-up PATCH, not N.
   - `flushNow()` bypasses the debounce timer and issues an immediate PATCH.
   - `editor.emit('blur')` triggers a PATCH within one tick.
   - Network failure → backoff schedule matches `[1000, 2000, 4000]` for the first three retries (using fake timers).
   - Pip state stays `dirty` for the first 3 failed attempts, then flips to `error`.
   - Successful PATCH clears the localStorage entry.
   - PATCH payloads never contain an `expectedVersion` field.

3. **`apps/fe/src/components/doc/section-block.test.tsx`** (update existing)
   - Mount with a localStorage snapshot where `savedAt > section.updatedAt` seeds editor content from the snapshot and issues an immediate PATCH.
   - Mount with a stale snapshot (`savedAt <= section.updatedAt`) clears the snapshot and uses server content.

4. **`apps/be/src/routes/sections.test.ts`** (update existing)
   - PATCH `/sections/:id` without `expectedVersion` succeeds and bumps `version` by 1.
   - PATCH `/sections/:id` with correct `expectedVersion` still succeeds (back-compat).
   - PATCH `/sections/:id` with mismatched `expectedVersion` still returns 409 (back-compat).

## Rollout

1. Ship BE change first (backwards-compatible: `expectedVersion` optional).
2. Ship FE change (stops sending `expectedVersion`, new pipeline).
3. No feature flag needed. No migration. Nothing to roll back beyond reverting the two PRs.

## Out of scope / post-MVP

- Real offline editing: `online` event draining, retry queue that survives network drops longer than a session.
- Cross-tab / multi-device conflict handling.
- Hash-based divergence detection (replaces timestamp).
- Version history UI using the already-present snapshot endpoints.
