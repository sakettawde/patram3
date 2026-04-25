# Patram — Mock AI Assistant Panel + Sessions (v1)

**Date:** 2026-04-25
**Status:** Approved design, ready for implementation planning
**Scope:** SPA-only. New left-side AI assistant panel inside the document workspace, multi-session chat threads listed in the sidebar via a tab switch, and the layout transitions between editor-centered and editor-side-by-side states.

## 1. Goal

Add a mock AI assistant UI that lives to the left of the editor inside the document workspace. When open, it occupies the left half of the content area and the editor moves to the right half (still respecting its current reading max-width). When closed, the editor returns to its current centered position. Chat is multi-session: the user can have multiple threads, switchable from a new "Sessions" tab in the sidebar.

The assistant is **interactive but fake** — typing and sending appends a user message and a canned/lorem reply after a short simulated delay. There is no real LLM call, no network, no agentic behavior in v1.

## 2. Non-goals (v1)

Explicitly out of scope — must not be built in this pass:

- Real LLM calls of any kind (Anthropic, OpenAI, local, server-proxied). All replies are local canned text.
- Server-side persistence of chat sessions. Sessions live in browser localStorage only, like documents do today.
- Per-document or per-section binding for sessions — sessions are a flat global list, independent of the currently selected doc.
- Streaming, tool use, function calling, retrieval, citations, file attachments, image input/output.
- Session sharing, export, search.
- Mobile or narrow-viewport responsiveness beyond what existing layout already does. Project is desktop-first.
- Dark mode (project does not have dark mode).
- Migration paths for the eventual real-LLM wiring. The mock store and component contract may need to change at that time; this spec does not pre-shape it.
- Markdown rendering / code highlighting in assistant replies. Plain text only.
- Editing or deleting individual messages within a session. Only the whole session can be deleted.

## 3. Foundational model

- The assistant is a **third top-level UI region**, peer to Sidebar and Topbar/Editor — not a child of the editor.
- The assistant's open/closed state and active session are **persisted in localStorage**, so reloads restore the workspace exactly as the user left it.
- Sessions are **flat and global**. A session is not attached to a doc. Switching docs does not switch sessions; switching sessions does not switch docs.
- The sidebar gains a **tab switcher** between "Docs" and "Sessions". The tab itself is persisted UI state. The bottom user-chip and the brand row remain visible regardless of active tab.
- The Topbar **stays full-width** above both the assistant panel and the editor when the panel is open. The assistant has its own internal header (title + close) below the topbar.
- All transitions are **animated** (~200ms ease-out) for both entry and exit, using width transitions that match the existing sidebar's behavior.

## 4. Layout

### 4.1 Structure

The current shell is a 2-col grid: `Sidebar | Main`, where Main = `Topbar` over a single editor column.

After this change, Main's content row (below Topbar) becomes a horizontal flex split with two children: AssistantPanel and EditorContainer.

```
┌────────┬─────────────────────────────────────┐
│        │  Topbar (full-width, unchanged)     │
│Sidebar ├──────────────────┬──────────────────┤
│ (tabs) │  AssistantPanel  │  EditorContainer │
│        │  (animates width)│  (centers editor)│
└────────┴──────────────────┴──────────────────┘
```

### 4.2 Open vs. closed

- **Closed:** AssistantPanel has `w-0`, `overflow-hidden`, and is effectively invisible. EditorContainer is `flex-1` and fills the entire content row. The editor inside it keeps its existing `mx-auto max-w-170 px-6` and is centered exactly as today.
- **Open:** AssistantPanel has `w-1/2`. EditorContainer is `flex-1` (still `min-w-0`), so it occupies the remaining 1/2. The editor inside it keeps `mx-auto max-w-170 px-6`, so it is centered within its half. Reading width is unchanged from the closed state — only the centering anchor moves.

### 4.3 Animation

- The width change of AssistantPanel is animated with `transition-[width] duration-200 ease-out` (matches existing Sidebar). EditorContainer reflows naturally as a flex sibling.
- AssistantPanel's **inner content** is rendered conditionally on `open` and uses an `opacity` transition (~150ms) so text does not visibly reflow during the slide. The panel scaffold (border, background) animates with the width; the content fades in once width is past a threshold (or simply, content has `opacity-0` when `!open` and `opacity-100` when `open`, with a slight delay on opening).
- The editor must not flash or jump during the transition. It transitions purely as a side effect of its flex sibling resizing.

### 4.4 No new responsive breakpoints

The layout does not introduce mobile-specific or narrow-viewport behavior. On narrow screens both panels simply get smaller; if it becomes unusable in practice, that is a follow-up.

## 5. Trigger

- **Topbar button:** A new icon button on the **left side of the Topbar**, before the doc title. Icon: lucide `Sparkles` (or `MessageSquare` if `Sparkles` reads too "AI-magic"; final pick at implementation time, but `Sparkles` is the default). Clicking toggles the panel open/closed. Button has a subtle "active" treatment when the panel is open.
- **Keyboard shortcut:** `Cmd/Ctrl + /` toggles the assistant panel. Wired in `AppShell` alongside the existing `Cmd/Ctrl + \` for the sidebar. The two shortcuts are independent — opening the assistant does not affect the sidebar and vice versa.
- **Sidebar interaction:** Selecting a session row in the Sessions tab opens the assistant if it was closed and switches the active session. Clicking "+ New chat" creates a new session, selects it, and opens the assistant.
- The Topbar button is always visible regardless of which sidebar tab is active.

## 6. AssistantPanel UI

### 6.1 Structure

```
┌────────────────────────────┐
│ Session title          [X] │  ← header (h-11, border-b --rule)
├────────────────────────────┤
│                            │
│  user bubble (right)       │  ← message list (flex-1, overflow-y-auto)
│  assistant bubble (left)   │
│  user bubble (right)       │
│  …typing                   │  ← typing indicator while pending
│                            │
├────────────────────────────┤
│ ┌────────────────────────┐ │  ← composer (border-t --rule)
│ │ Ask anything...      ↑ │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

### 6.2 Header

- Height matches Topbar (`h-11`) so the two horizontal rules across the screen line up.
- Shows the active session title (truncated). Title is a click-to-rename plain `<button>`-like control: clicking turns it into an inline `<input>` for renaming; Enter commits, Escape cancels, blur commits.
- Right side has a single close `X` button (lucide `X`). Closing collapses the panel; it does not delete the session.
- No additional menu in v1 (delete is in the sidebar row dropdown).

### 6.3 Message list

- `flex-1 overflow-y-auto` with vertical scrolling. Auto-scrolls to the bottom on new messages and on session switch.
- **User bubbles:** right-aligned, `bg-(--paper-soft)`, rounded, padding `py-2 px-3`, max-width ~85% of the panel content width.
- **Assistant bubbles:** left-aligned, no background, just text in `--ink`. Same padding/typography for visual rhythm.
- **Typing indicator:** when `pending` is true and a session is active, render a small "…" or three-dot row in the assistant slot at the bottom, distinct from any real assistant message.
- **Empty state:** when the active session has zero messages and `pending` is false, show a faint centered "Start a conversation" placeholder in the message list area.

### 6.4 Composer

- Pinned to the bottom with `border-t --rule`. Padding mirrors the panel header.
- A `<textarea>` with auto-grow up to a small cap (~6 lines), then internal scroll. Placeholder: "Ask anything…".
- Send button: small icon button (lucide `ArrowUp` or `Send`) on the right inside the textarea or just below it. Disabled when input is empty or whitespace-only, or when `pending` is true.
- **Keyboard:** `Enter` sends. `Shift + Enter` inserts a newline. Sending clears the textarea immediately.
- After sending, focus stays in the textarea so the user can keep typing.

### 6.5 No-active-session state

If `selectedSessionId` is null when the panel opens (e.g. first time, or after deleting the last session), the panel auto-creates a new "New chat" session and selects it. The user never sees a literal "no session" empty state inside the panel.

## 7. Mock reply behavior

- On send, the store appends a user message immediately, sets `pending = true`, and schedules a reply with `setTimeout` for a random delay between **600ms and 1100ms**. When the timer fires, an assistant message is appended and `pending` becomes false.
- The reply content is drawn from a small pool (~6 entries) of short lorem-style paragraphs in `apps/fe/src/lib/mock-replies.ts`. Selection cycles through the pool deterministically per session (round-robin via the session's existing message count modulo pool size) so behavior is reproducible during dev.
- If the user sends another message while `pending` is true, the new user message is appended; the in-flight reply timer stays as-is and resolves to the next assistant message. We do **not** queue, debounce, or cancel.
- If the user switches sessions or closes the panel while a reply is pending, the timer still fires and writes to its original session — replies are bound to the session id captured at send time, not to the currently-active session.
- If the user deletes a session while its reply is pending, the timer fires but the store's reply handler no-ops because the session no longer exists.

## 8. Sidebar tabs

### 8.1 Structure

```
┌────────────────────┐
│ Patram        [‹]  │  ← brand row (existing)
├────────────────────┤
│ [ Docs | Sessions ]│  ← new segmented tabs
├────────────────────┤
│ + New …            │  ← contextual: "New doc" or "New chat"
│ ── list rows ──    │
│ …                  │
├────────────────────┤
│ User chip (existing)│
└────────────────────┘
```

- Tabs sit above the contextual "+ New …" + list area.
- Active tab persists in `stores/ui.ts`.
- Visual treatment: a simple two-segment switcher styled with `--paper-soft` for the active segment, no background for the inactive one. Matches the project's minimalist tone (no shadcn `Tabs` is necessary; a small custom control is fine).

### 8.2 Docs tab (unchanged)

The Docs tab renders today's content verbatim: search field, doc rows sorted by `updatedAt` desc, "+ New doc" button. No change to behavior.

### 8.3 Sessions tab

- Header inside the panel: "+ New chat" button mirroring the "+ New doc" affordance. Creates a new session, selects it, opens the assistant if closed.
- List of sessions sorted by `updatedAt` desc.
- Each row shows session title (truncated, falls back to "New chat" if no messages yet) and a relative last-updated time, mirroring `DocRow`'s typography.
- The active session row gets the same selected-row treatment that `DocRow` uses today.
- Row dropdown (right-aligned three-dots, like `DocRow`'s) has a single destructive "Delete" item. Deleting the active session selects the next session in the list, or null if it was the last (in which case the panel auto-creates a new "New chat" on next open).

### 8.4 Sidebar collapse

The sidebar's existing collapse behavior is unchanged. Collapsing the sidebar collapses both tabs together. The active tab is preserved across collapse/expand.

## 9. Data model & state

### 9.1 New store: `apps/fe/src/stores/assistant.ts`

Mirrors the structure and persistence approach of `stores/documents.ts`. Persisted to localStorage under a new key (`patram.assistant.v1`).

```ts
type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

type ChatSession = {
  id: string;
  title: string; // auto-derived from first user message; user can rename
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

type AssistantState = {
  open: boolean;
  selectedSessionId: string | null;
  sessions: Record<string, ChatSession>;
  order: string[]; // session ids, no implied sort; UI sorts by updatedAt
  pending: boolean; // true while a mock reply is in flight for the *active* session
};
```

Actions:

- `toggleOpen()` / `setOpen(open: boolean)`
- `createSession(): string` — returns the new session id, sets it as `selectedSessionId`, opens the panel.
- `selectSession(id)` — sets active session; opens panel if closed.
- `renameSession(id, title)` — used by inline rename in the header.
- `deleteSession(id)` — removes the session, advances `selectedSessionId` to the next-most-recent or null.
- `sendMessage(content)` — appends a user message to the _active_ session (no-op if none), sets `pending=true`, schedules the canned reply.

`pending` is a single boolean. Because v1 only ever has one active reply timer at a time _per session_ and the indicator is only shown for the active session, a single boolean keyed off the active session is sufficient. If session-switching mid-reply needs distinct indicators per session, that becomes a follow-up.

### 9.2 New store: `apps/fe/src/stores/ui.ts`

Small persisted store for sidebar UI:

```ts
type UiState = {
  sidebarTab: "docs" | "sessions";
  setSidebarTab(tab: "docs" | "sessions"): void;
};
```

Persisted under `patram.ui.v1`.

### 9.3 Mock reply source: `apps/fe/src/lib/mock-replies.ts`

Exports:

- `MOCK_REPLIES: readonly string[]` — ~6 short strings.
- `pickReply(messageCount: number): string` — round-robin selection.

Pure module, no side effects, trivially unit-testable.

## 10. File-level changes

### New files

- `apps/fe/src/stores/assistant.ts`
- `apps/fe/src/stores/ui.ts`
- `apps/fe/src/lib/mock-replies.ts`
- `apps/fe/src/components/assistant/assistant-panel.tsx`
- `apps/fe/src/components/assistant/message-list.tsx`
- `apps/fe/src/components/assistant/message-bubble.tsx`
- `apps/fe/src/components/assistant/composer.tsx`
- `apps/fe/src/components/sidebar/sidebar-tabs.tsx`
- `apps/fe/src/components/sidebar/session-row.tsx`
- `apps/fe/src/components/sidebar/sessions-list.tsx`

### Modified files

- `apps/fe/src/components/app-shell.tsx` — restructure Main as `Topbar` + flex-row content with `AssistantPanel | EditorContainer`. Wire `Cmd/Ctrl + /` shortcut alongside the existing `Cmd/Ctrl + \`.
- `apps/fe/src/components/topbar.tsx` — add the assistant toggle icon button on the left, before the doc title. Show "active" state when the panel is open.
- `apps/fe/src/components/sidebar/sidebar.tsx` — render the new tab switcher, render `DocsList` (today's content extracted into its own component if helpful) or `SessionsList` based on active tab.
- `apps/fe/src/components/app-shell.test.tsx` — update for the new layout structure and the `Ctrl + /` shortcut.

### Untouched

- Backend (`apps/be`), routing, auth, persistence layer (D1/Drizzle), document store and editor internals.

## 11. Testing

### 11.1 Unit tests

- `stores/assistant.test.ts`:
  - `createSession` adds to `sessions` and `order`, sets `selectedSessionId`, sets `open=true`.
  - `selectSession` updates `selectedSessionId` and sets `open=true`.
  - `deleteSession` removes from both maps and advances `selectedSessionId` correctly (next-most-recent, or null when empty).
  - `sendMessage` appends a user message synchronously, sets `pending=true`, and after the timer (use fake timers) appends an assistant message and clears `pending`.
  - Round-robin reply selection: send N messages, assert assistant content cycles through the pool.
  - Pending-with-deleted-session: delete the session before the timer fires; the timer does not throw and the store is unchanged.
- `stores/ui.test.ts`: tab switching persists.
- `lib/mock-replies.test.ts`: `pickReply` returns expected entries for known indices.

### 11.2 Component tests

- `assistant-panel.test.tsx`:
  - Typing and pressing Enter sends the message; user bubble appears.
  - Pending indicator shows while waiting; after the timer, an assistant bubble appears.
  - Shift+Enter inserts a newline rather than sending.
  - Empty composer disables the send button.
- `app-shell.test.tsx` (updated):
  - Layout has the assistant region present (with `w-0` when closed, with non-zero width when open).
  - `Ctrl + /` toggles the assistant; `Ctrl + \` toggles the sidebar; the two are independent.
- `sidebar-tabs.test.tsx`:
  - Switching to Sessions renders the sessions list, hides the docs list. Switching back restores docs.

### 11.3 Manual verification

- Open and close via button and via `Ctrl + /`. Confirm the editor reading width is identical in both states; only the centering anchor moves.
- Reload the page with the panel open; it stays open and on the same session.
- Create multiple sessions, switch between them, delete the active one, delete the last one, confirm the auto-create on next open.
- Send a message, switch sessions while `pending` is true, switch back; confirm the reply landed on the original session.

## 12. Risks & open questions

- **Width transition jank.** Animating `width: 50%` from `width: 0` works in modern browsers but can stutter if children layout-thrash. Mitigation: render inner content only when `open`, and fade with opacity. If still janky, fall back to fixed-width (e.g. `w-[480px]`) on open and revisit. The user's stated intent is 50/50, so we keep that as the default.
- **Topbar "ownership" when split.** Keeping the Topbar full-width across both halves is a deliberate choice for visual continuity (single horizontal rule across the top). If during implementation the doc title above the assistant panel feels wrong, the spec can be updated to scope the Topbar to the editor half only — but default is full-width.
- **Sparkles vs. MessageSquare icon.** Final icon is a coin-flip at implementation time; both are acceptable. Documented here so it doesn't become a blocker.
- **Round-robin determinism vs. variety.** Cycling makes tests easy. If it feels too obvious in manual use, swap to seeded random — single-line change.
