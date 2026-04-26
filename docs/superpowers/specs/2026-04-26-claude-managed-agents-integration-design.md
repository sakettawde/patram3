# Claude Managed Agents Integration — Design

**Date:** 2026-04-26
**Branch:** `feat/spa-d1-user-auth` (or successor)
**Status:** Draft for review

## Context

The assistant panel and multi-session UI shipped on this branch (commits `25293eb`..`37778e0`) currently talk to a mocked reply path with canned responses. We're replacing that mock with a real backend integration to Anthropic's **Managed Agents** beta API.

Constraints we're designing to:

- The agent is already created on the Anthropic console — agent creation is **not** part of this work.
- The Anthropic API key lives on the BE only. The browser must never see it.
- The existing FE multi-session UX (sidebar Sessions tab, per-session composer, persisted state, per-session pending replies) stays intact. Only the reply-source changes.
- BE is a Hono app on Cloudflare Workers with D1 + Drizzle. The Anthropic TypeScript SDK is expected to run unmodified on Workers; we'll add the `nodejs_compat` flag only if the SDK requires it.

The intended outcome is a streaming, file-aware chat UI where the user can talk to the configured Claude agent across multiple persisted sessions, attach images/PDFs/text files per message, watch the agent's high-level activity (tool use, thinking) while it works, and stop a reply mid-stream.

## Decisions

| Axis                             | Decision                                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth (v1)             | **A** — FE localStorage holds messages and the Anthropic session id. BE is a stateless proxy. Designed so migration to **B** (BE-owned D1 persistence) is bounded and contract-stable. |
| Response delivery                | Streaming over SSE. Text deltas, activity events, and an end-of-message event are normalized by the BE before reaching the FE.                                                         |
| File inputs                      | Per-message attachments. Supported in v1: images (PNG/JPEG/WebP/GIF), PDFs, plain text/code (.md, .ts, .json, .log, etc.). No session-scoped library.                                  |
| Agent step visibility            | Single collapsible **Activity strip** above the streaming bubble. One-line latest-step label by default; expands to a list of steps.                                                   |
| Cancel                           | Stop button replaces send while streaming. Aborts SSE on the FE; fires a best-effort `cancel` to the BE. Partial reply kept; no error marker.                                          |
| Agent / environment provisioning | `ANTHROPIC_AGENT_ID` is a Wrangler secret. An Anthropic environment is created **per Patram session** at first send and stored alongside the session id.                               |

## Architecture

### BE — Hono routes

New module `apps/be/src/lib/anthropic.ts` exposes a per-request SDK client built from `c.env.ANTHROPIC_API_KEY` (with the beta header for managed agents).

New router mounted at `/assistant`:

| Endpoint                                       | Purpose                                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /assistant/sessions`                     | Creates an environment, then a session bound to `ANTHROPIC_AGENT_ID`. Returns `{ sessionId, environmentId }`.                                                  |
| `POST /assistant/files` (multipart)            | Forwards file to Anthropic Files API. Returns `{ fileId, type, name, size }`.                                                                                  |
| `POST /assistant/sessions/:sessionId/messages` | Body: `{ text, attachments, environmentId }`. Sends `user.message` event to the session, then opens the agent stream and pipes a normalized SSE response back. |
| `POST /assistant/sessions/:sessionId/cancel`   | Best-effort end-of-turn signal. FE has already aborted the SSE; this is to keep Anthropic from continuing to run.                                              |

The BE does **not** persist any chat data in v1 — no D1 schema additions. CORS continues to follow the existing `/users` pattern. v1 assumes the same access scope as existing routes (no per-user gating); once `feat/spa-d1-user-auth` lands, an auth check is added uniformly to `/assistant/*` the same way it's added to `/users/*`.

### Normalized SSE event shape (BE → FE)

The BE translates Anthropic's stream events into a stable wire format so frontend code is insulated from SDK changes. Each line is `data: <json>` followed by a blank line. Event types:

- `message_start` — `{ id, createdAt }`
- `text_delta` — `{ delta }` (string fragment to append)
- `activity` — `{ kind: "tool_use" | "tool_result" | "thinking" | "status", label, summary? }`
- `message_end` — `{ usage?, citations? }`
- `error` — `{ message, retryable }`

### FE — module layout

New under `apps/fe/src/`:

- `lib/assistant-api.ts` — typed BE client: `createSession`, `uploadFile`, `streamMessage(sessionId, body, { signal, onEvent })`, `cancel(sessionId)`.
- `lib/sse.ts` — small SSE reader on `fetch` + `ReadableStreamDefaultReader` (we POST and want auth headers, so `EventSource` is unsuitable). Parses event lines, handles chunk splits, propagates `AbortSignal`.
- `components/assistant/activity-strip.tsx` — collapsible step list rendered above the streaming bubble.
- `components/assistant/attachment-row.tsx` + `attachment-chip.tsx` — composer attachment UI (image thumbnail, PDF/file icons, upload progress, remove ×, failed-upload retry).
- `components/assistant/markdown.tsx` — markdown renderer for assistant bubbles, with code-block copy.

Modified:

- `stores/assistant.ts` — replace mock reply path; add per-session `anthropicSessionId`, `environmentId`, and a `streaming` slot for the in-progress assistant message; new actions for `sendMessage` (real), `appendDelta`, `pushActivity`, `endStreaming`, `cancelStreaming`, `failStreaming`, `uploadAttachment`. Persistence partializes to: sessions (including `anthropicSessionId` and `environmentId`), order, selectedSessionId, open. The `streaming` slot and `pendingSessionIds` stay ephemeral and are dropped on rehydration.
- `components/assistant/composer.tsx` — adds attachment row; send button toggles to stop button while a stream is active for the selected session.
- `components/assistant/message-bubble.tsx` — assistant bubbles render markdown; user bubbles render plain text + attachment chips beneath.
- `components/assistant/message-list.tsx` — appends the in-progress streaming bubble (with activity strip) when present.

## Data flow

### Lazy session bootstrap

A Patram session is created in the FE store as today (so the UI feels instant). The Anthropic session is created on the **first** `sendMessage` for that Patram session: if `anthropicSessionId` is null, FE calls `POST /assistant/sessions`, stores `{ sessionId, environmentId }` on the session record, persists, then proceeds with the send. This avoids burning Anthropic resources on empty chats.

### Send with attachments

1. As the user adds files, each file's chip drives an upload:
   - Image / PDF → `POST /assistant/files` immediately, chip carries returned `fileId` on success.
   - Text / code → read on the FE; chip carries the inline text content. No network call.
2. Send is disabled while any chip is mid-upload or text is empty.
3. On send, FE:
   - Optimistically appends the user message (with attachment metadata) to the store.
   - Clears composer text and chips.
   - Opens the SSE stream to `POST /assistant/sessions/:id/messages` with `{ text, attachments, environmentId }`.
4. BE assembles Anthropic content blocks:
   - text → `{ type: "text", text }`
   - image → `{ type: "image", source: { type: "file", file_id } }`
   - PDF → `{ type: "document", source: { type: "file", file_id } }`
   - text/code → `{ type: "text", text: "Attached file: <name>\n\n<content>" }`
5. BE calls `sessions.events.send(...)`, then `sessions.events.stream(...)`, normalizing each event onto the wire format above.

### Streaming on the FE

The store's `streaming` slot holds `{ sessionId, messageId, text, activity[], status }`. As events arrive:

- `message_start` initializes the slot.
- `text_delta` appends to `text`.
- `activity` pushes to `activity[]` and updates `status`.
- `message_end` commits the assembled message to `messages[]` and clears the slot.
- `error` sets `status: "error"` (partial text retained), shows a Retry row.

Per-session pending tracking from the existing implementation extends naturally: the SSE call is bound to the session id captured at send time, so switching sessions while streaming is safe.

### Cancel

While `streaming` is set for the selected session, the composer's send button shows a stop icon. Click triggers `AbortController.abort()` on the SSE fetch and a fire-and-forget `POST /assistant/sessions/:id/cancel`. Partial text is kept; `streaming.status` becomes `"cancelled"` and the slot is committed to `messages[]` without a retry affordance.

### Errors

- **Pre-stream HTTP failure** (network, BE 5xx, Anthropic auth failure): no message bubble created; an inline error row appears with a Retry button that re-runs the same send.
- **Mid-stream `error` event or transport drop**: partial text retained, an "(reply was interrupted)" caption appears with Retry. Retry sends a continuation prompt rather than re-sending the original user turn.
- **File upload failure**: chip flags failed; send blocked until the chip is removed or retried.

### Reload mid-stream

On reload, persisted state restores messages and the Patram session. The `streaming` slot is dropped on rehydration; we do not attempt to reattach to an in-flight Anthropic stream. Any partial text already committed before reload stays. (Server-side stream resume is out of scope.)

## UI notes

- Assistant bubbles render markdown (headings, lists, inline/block code, tables, links). Code blocks have a copy button. Long code blocks scroll horizontally.
- The activity strip sits in the top-right of the streaming bubble's vertical run. Default state shows the latest step's label (e.g. "Searching the web…", "Reading attachment.pdf"). Click expands a vertical list of past steps with timestamps.
- Per-message attachment chips: image chips show a 32px square thumbnail; PDF / text chips show an icon + filename + size. All chips have a small × to remove. Failed-upload chips show a red border + retry icon.
- Stop button is the same shape as the send button (preserves layout) with a square fill icon.

## Forward path to source-of-truth B

Migration from A → B is bounded:

- **BE**: add D1 schema for `assistant_sessions(user_id, our_id, anthropic_session_id, environment_id, ...)` and `assistant_messages(session_id, role, content, ...)`. Endpoints accept `our_id` instead of `anthropic_session_id`. BE writes both user and assistant turns to D1 as the stream completes.
- **FE**: stop persisting `messages[]` and `anthropicSessionId` in localStorage; fetch session list and message history from BE; keep only UI state (open / selected / pending) in localStorage.

The wire format for the SSE stream and the event shapes for files/messages do not need to change.

## Verification

End-to-end smoke (manual, post-implementation):

1. Open assistant → send "hi" → user bubble appears → activity strip shows working state → assistant text streams in → activity collapses on completion.
2. Attach 1 image + 1 PDF + 1 `.ts` file → send a prompt asking the agent to summarize each → confirm all three reach the agent.
3. Send a long prompt → click stop mid-stream → partial text retained, no error row.
4. Throttle network → send → mid-stream drop → "(reply was interrupted)" + Retry → completes after retry.
5. Reload mid-stream → partial text persists; new sends in the same session continue working.
6. Send in session A, switch to session B during stream, return to A — reply landed in A.
7. `vp check` and `vp test` clean (BE and FE).

Out of scope for v1: session-scoped file libraries, discrete-block citation rendering, server-side stream resume, multi-agent selection in UI, BE persistence of messages, per-user agent configuration.

## Critical files

- `apps/be/src/index.ts` — mount `/assistant` router.
- `apps/be/src/lib/anthropic.ts` (new) — SDK client factory.
- `apps/be/src/routes/assistant.ts` (new) — sessions, files, messages (SSE), cancel.
- `apps/be/wrangler.jsonc` — add `ANTHROPIC_API_KEY` and `ANTHROPIC_AGENT_ID` as secrets (via `wrangler secret put`).
- `apps/fe/src/stores/assistant.ts` — replace mock with real send path; add streaming slot and Anthropic ids on session records.
- `apps/fe/src/lib/assistant-api.ts` (new), `apps/fe/src/lib/sse.ts` (new).
- `apps/fe/src/components/assistant/composer.tsx` — attachment row, stop button.
- `apps/fe/src/components/assistant/message-bubble.tsx` — markdown for assistant, attachment chips for user.
- `apps/fe/src/components/assistant/message-list.tsx` — render in-progress streaming bubble.
- `apps/fe/src/components/assistant/activity-strip.tsx` (new), `attachment-row.tsx` (new), `attachment-chip.tsx` (new), `markdown.tsx` (new).
