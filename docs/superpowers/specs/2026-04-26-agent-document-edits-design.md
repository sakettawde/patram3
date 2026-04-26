# Agent-Driven Document Edits — Design

**Date:** 2026-04-26
**Branch:** `feat/assistant-managed-agents` (or successor)
**Status:** Draft for review

## Context

The assistant chat UI is wired to Anthropic Managed Agents (per the [2026-04-26 Managed Agents integration spec](2026-04-26-claude-managed-agents-integration-design.md)). Today the agent can stream replies, accept attachments, and emit tool-use activity, but it has no way to act on the user's documents — chat sessions and documents are completely independent.

This design adds the ability for the agent to **propose edits** to the document the user is working on. The user reviews each proposal as an inline diff in the editor and chooses Accept or Reject. The agent does not modify the document directly.

Constraints we're designing to:

- The Anthropic agent and its tool list are configured on the Anthropic console — declaring custom tools is a console / SDK config step, not a code-deploy step.
- Documents already persist in D1 (`documents.contentJson` as Tiptap JSON) and autosave through the existing debounced PATCH in [useUpdateDoc](../../apps/fe/src/queries/documents.ts).
- The assistant SSE wire format (`message_start` / `text_delta` / `activity` / `message_end` / `error`) is the stable BE→FE contract from the integration spec; we extend it additively.
- Block-level edits require stable block IDs in Tiptap, which the editor currently lacks.

## Decisions

| Axis                       | Decision                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Edit UX                    | Proposed diffs the user accepts or rejects — no live co-editing.                        |
| Edit granularity           | Block-level ops via custom tools (replace / insert-after / delete).                     |
| Chat ⇄ doc binding         | One chat per doc; the assistant pane always shows the chat for the active doc.          |
| Diff presentation          | Inline overlays in the editor + a sticky "review changes" bar.                          |
| How the agent sees the doc | Auto-inject the full doc as Markdown-with-IDs on every turn.                            |
| Tool blocking model        | Fire-and-stream — tool returns "ok" immediately; user reviews after the agent finishes. |
| Proposal persistence       | Ephemeral (FE memory). Dropped on reload, mirroring the existing `streaming` slot.      |

## Architecture

### Tool surface

Three custom tools are declared on the Anthropic agent config:

- `propose_replace_block(block_id: string, new_content_markdown: string)` — replace one block's contents.
- `propose_insert_block_after(after_block_id: string, new_content_markdown: string)` — insert a new block after the named one. The literal value `"TOP"` means "insert at the start of the doc".
- `propose_delete_block(block_id: string)` — remove a block.

The agent always works in **Markdown**. The BE serializes Tiptap JSON → Markdown when injecting the doc; the FE parses Markdown → Tiptap nodes when applying an accepted proposal. LLMs are far better at Markdown than at Tiptap's nested-JSON shape, and the conversion is well-trodden territory.

### Block IDs

Tiptap nodes don't have stable IDs out of the box. We add a `UniqueID` extension that:

- Stamps every block-level node with `id: <nanoid(8)>` on creation.
- Persists the ID inside `contentJson` (so reload + autosave round-trip preserves them).
- Generates an ID for any node that arrives without one (e.g. legacy docs, paste from elsewhere).

When the BE serializes a doc to send to the agent, each block is prefixed with an HTML comment carrying its ID, e.g.:

```
<!-- id:abc123 -->
# My intro

<!-- id:def456 -->
First paragraph.

<!-- id:ghi789 -->
- list item
- another item
```

The agent quotes those IDs back when calling tools.

### Wire format additions (BE → FE SSE)

One new event type is added; existing types are unchanged:

- `proposal` — `{ id: string, kind: "replace" | "insert_after" | "delete", blockId: string, afterBlockId?: string | "TOP", content?: string, toolUseId: string }`

`id` is a FE-local handle for tracking accept/reject; it is distinct from the Anthropic `toolUseId` (which the BE uses for its `user.tool_result` round-trip and isn't surfaced to the UI).

### BE flow per turn

1. FE sends `POST /assistant/sessions/:id/messages` with the existing body **plus `documentId: string`**.
2. BE loads the doc by `(documentId, userId)` from D1.
3. BE serializes the doc to Markdown-with-IDs and prepends it as a `text` content block on the `user.message` payload.
4. BE forwards the user message and opens the agent stream as today.
5. When `agent.custom_tool_use { name: "propose_*", input, id: tool_use_id }` arrives:
   - Translate to a `proposal` wire event and forward to the FE.
   - Immediately send `user.tool_result { tool_use_id, content: "ok" }` back to Anthropic so the agent can keep streaming further proposals or its closing message.
6. All other event translations (`text_delta`, `activity`, etc.) keep working unchanged.

The BE never validates whether a `block_id` exists in the doc. Validation happens on the FE when the proposal is rendered (a stale ID just shows up as an invalid proposal that gets auto-removed — see "Concurrency & staleness").

### FE flow

**Stores:**

- `stores/assistant.ts` — `ChatSession` gets a `documentId` field. Sessions are auto-selected by doc; new sessions are created lazily when the user opens the assistant on a doc that doesn't have one yet. Existing `anthropicSessionId` lazy bootstrap is unchanged.
- `stores/proposals.ts` (new) — keyed by `documentId`, holds an array of pending proposals per doc. Ephemeral; not persisted; dropped on reload. Actions: `addProposal`, `removeProposal`, `clearProposals(documentId)`.

**Editor integration:**

- `components/editor/extensions.ts` — register the `UniqueID` extension for all block-level node types.
- `components/editor/proposal-decorations.ts` (new) — Tiptap decoration plugin that overlays proposals on their target blocks:
  - `replace`: original block's text struck through; new Markdown rendered underneath in green; per-block Accept / Reject chips.
  - `insert_after`: a green ghost block rendered between two real blocks; Accept / Reject chips.
  - `delete`: original block tinted red with strikethrough; Accept / Reject chips.
- `components/editor/review-bar.tsx` (new) — sticky bar at the top of the doc shown only when proposals exist for the active doc: "Agent proposed N changes — Accept all / Reject all".

**Apply logic:**

- Accept on a single proposal → run the matching Tiptap command (replaceNodeAt / insertContentAt / deleteNode), feeding it the parsed Markdown → existing autosave debounce flushes the new `contentJson` to D1 → proposal removed from store.
- Reject → proposal removed from store; doc untouched.
- Accept-all iterates through proposals **in document order** so that earlier inserts don't shift later target positions in surprising ways. Reject-all clears the store.

**Send-message payload:**

- `lib/assistant-api.ts` — `sendMessage` body grows `documentId`. The SSE reader learns the new `proposal` event and dispatches to the proposals store via a callback the assistant store wires up.

### Chat ⇄ doc binding

- The existing sessions sidebar becomes a list of **"docs you've chatted about"** — each entry shows the doc emoji + title and points to the doc. Selecting a doc anywhere in the app auto-selects (or creates) that doc's chat.
- The "new chat" affordance is removed — there is exactly one chat per doc. To start fresh on a doc, the user clears history within the existing chat (out of scope for v1) or deletes the session (which gets recreated on next send).
- Pre-existing free-floating sessions on the user's localStorage are dropped on rollout. The product is early-stage; the migration cost isn't worth it.

## UI notes

- The review bar is a single full-width strip just below the topbar in the doc surface, only present when `proposals[documentId].length > 0`.
- Per-block chips sit at the right edge of each affected block, vertically centered, so they don't reflow the prose.
- A small badge on the assistant-pane toggle counts pending proposals across the active doc, so the user notices new proposals even with the pane collapsed.
- The activity strip in the streaming bubble already shows tool-use events from the integration spec — `propose_*` calls flow through unchanged and label as e.g. "propose_replace_block".

## Concurrency & staleness

- The user can keep typing in any block while proposals are pending.
- If the user edits a block that has a pending proposal, that proposal is **auto-rejected** (silently removed). Accepting it would clobber the user's edits, and a warning state is more confusing than letting the user just re-ask.
- If a proposal references a block that no longer exists (e.g. user or an earlier accepted proposal deleted it), the proposal is auto-removed with a small toast: "An agent proposal targeted a block that no longer exists."
- Autosave continues normally; accepted proposals feed into the existing `useUpdateDoc.schedule` path with no new save logic.
- The agent only sees a fresh doc snapshot on the **next** send. So if the user accepts/rejects/edits between turns, the agent's view will be correct on its next turn — there's no need to push state back to the agent during a turn.

## Persistence

- No new D1 tables. Proposals are FE memory only.
- The chat session's `documentId` joins `anthropicSessionId` / `environmentId` in the existing assistant localStorage partial so the doc binding survives reload.
- Accepted edits go through the existing `useUpdateDoc` PATCH path — no new server-side persistence work.

## Reload behavior

- Pending proposals are dropped on reload, mirroring the existing `streaming` slot. If the agent was mid-turn when the user refreshed, any proposals not yet accepted are gone; the agent's text reply (whatever was committed before reload) stays.
- The chat ⇄ doc binding survives reload because `documentId` is in the persisted partial.

## Forward path

The wire format and tool surface are stable enough that the following are bounded extensions, not redesigns:

- **BE-side proposal persistence**: add a `proposals` table keyed by user + session + tool_use_id; resume on reload. Wire format unchanged.
- **Selection-aware editing**: FE includes the current Tiptap selection in the send body; BE injects "current selection: ..." alongside the doc.
- **Per-proposal "iterate" mode** (the Question-6 B path): block on user accept/reject before returning the tool result. Same tools, different BE tool-result timing.
- **Multi-doc edits**: tools learn an explicit `document_id` parameter; BE can inject multiple docs by ID.

## Verification

End-to-end smoke (manual, post-implementation):

1. Open a doc → open the assistant → "make the intro punchier" → see proposals appear inline as the agent streams → Accept one, Reject another → autosave finishes → reload → committed state matches.
2. "Add a new section called 'Risks' after Background" → `propose_insert_block_after` overlay shows in the right spot → Accept.
3. "Delete the paragraph about pricing" → red-strikethrough overlay → Accept.
4. While proposals are pending, edit one of the proposed blocks yourself → that proposal auto-rejects; others remain.
5. Switch docs mid-stream → proposals for the previous doc stay attached to it; switching back shows them; the new doc's chat is selected.
6. Send a turn that produces 5 proposals → "Agent proposed 5 changes — Accept all / Reject all" bar appears → Accept-all applies all five in document order; doc autosaves once.
7. `vp check` and `vp test` clean (BE and FE).

## Out of scope for v1

- Per-block "let the agent iterate based on rejections" (Question-6 option B).
- BE-side proposal persistence / cross-device proposal review.
- Selection-aware editing (only edit the highlighted region).
- Multi-doc edits in a single turn.
- Citation linking from accepted edits back to the agent message that proposed them.
- A "history of past proposals" log.

## Critical files

**Backend:**

- `apps/be/src/routes/assistant.ts` — accept `documentId` on the send body; load + serialize doc; handle `agent.custom_tool_use` → `proposal` wire event + immediate `user.tool_result`.
- `apps/be/src/lib/document-markdown.ts` (new) — Tiptap JSON → Markdown-with-IDs serializer (and the inverse if it ends up shared with FE).

**Frontend:**

- `apps/fe/src/stores/assistant.ts` — `documentId` on `ChatSession`; auto-select / auto-create chat on doc switch; remove "new chat" affordance.
- `apps/fe/src/stores/proposals.ts` (new) — pending proposals per doc, with add / remove / clear actions.
- `apps/fe/src/components/editor/extensions.ts` — register `UniqueID` extension.
- `apps/fe/src/components/editor/proposal-decorations.ts` (new) — Tiptap plugin rendering inline overlays.
- `apps/fe/src/components/editor/review-bar.tsx` (new) — sticky review bar.
- `apps/fe/src/components/doc/doc-surface.tsx` — mount review bar; route accepted proposals through the existing `useUpdateDoc` schedule.
- `apps/fe/src/components/assistant/sidebar/*` — sessions list becomes "docs you've chatted about"; remove "new chat" UI.
- `apps/fe/src/lib/assistant-api.ts` — add `documentId` to the send-message payload; parse the new `proposal` wire event.
- `apps/fe/src/lib/markdown.ts` (new, or shared with BE serializer) — Markdown ⇄ Tiptap JSON helpers used when applying accepted proposals.
