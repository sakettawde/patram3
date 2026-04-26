# Agent-Driven Document Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Anthropic agent propose block-level edits to the active document; user reviews each proposal as an inline diff and accepts or rejects.

**Architecture:** Three custom Anthropic tools (`propose_replace_block`, `propose_insert_block_after`, `propose_delete_block`) are declared on the agent. The BE auto-injects the current doc as Markdown-with-IDs on every send, intercepts `agent.custom_tool_use` for those tools, sends back `user.tool_result: ok` immediately (fire-and-stream), and forwards each proposal to the FE as a new `proposal` SSE event. The FE stages proposals in a per-doc store, renders them as inline Tiptap decorations with Accept / Reject chips, and applies accepted edits through the existing autosave path.

**Tech Stack:** TypeScript, Hono on Cloudflare Workers, Drizzle/D1, Anthropic SDK v0.91+ (managed agents beta), Tiptap (ProseMirror), Zustand, Vitest via Vite+ (`vp test`).

**Spec:** [docs/superpowers/specs/2026-04-26-agent-document-edits-design.md](../specs/2026-04-26-agent-document-edits-design.md)

---

## Pre-requisite (out-of-code, do once before Task 5 ships)

On the Anthropic console, edit the agent identified by `ANTHROPIC_AGENT_ID` and add three custom tools:

- `propose_replace_block` — params: `block_id: string`, `new_content_markdown: string`
- `propose_insert_block_after` — params: `after_block_id: string` (or literal `"TOP"`), `new_content_markdown: string`
- `propose_delete_block` — params: `block_id: string`

System prompt should explain the doc-injection format (Markdown blocks prefixed with `<!-- id:X -->` HTML comments) and that the agent should call these tools to make edits rather than describing changes in prose. Note: tools are configured per-agent, not deployed from this repo.

---

## File Structure

**New BE files:**

- `apps/be/src/lib/document-markdown.ts` — Tiptap JSON → Markdown-with-IDs serializer
- `apps/be/src/lib/document-markdown.test.ts` — serializer tests
- `apps/be/src/lib/assistant-translate.ts` — extracted SSE translator (was inline in route) + new propose\_\* handling
- `apps/be/src/lib/assistant-translate.test.ts` — translator tests

**Modified BE files:**

- `apps/be/src/routes/assistant.ts` — accept `documentId` on send body; load doc; prepend Markdown-with-IDs; use extracted translator; send `user.tool_result` after propose\_\* calls

**New FE files:**

- `apps/fe/src/components/editor/unique-id.ts` — Tiptap extension stamping `id` on block nodes
- `apps/fe/src/components/editor/unique-id.test.ts`
- `apps/fe/src/components/editor/proposal-decorations.ts` — ProseMirror plugin rendering inline overlays
- `apps/fe/src/components/editor/review-bar.tsx` — sticky Accept-all / Reject-all bar
- `apps/fe/src/components/editor/review-bar.test.tsx`
- `apps/fe/src/lib/markdown-to-html.ts` — thin wrapper around `marked`
- `apps/fe/src/lib/markdown-to-html.test.ts`
- `apps/fe/src/stores/proposals.ts` — per-doc pending proposals store
- `apps/fe/src/stores/proposals.test.ts`

**Modified FE files:**

- `apps/fe/src/lib/assistant-api.ts` — `documentId` on send body; parse `proposal` SSE event
- `apps/fe/src/stores/assistant.ts` — `documentId` on `ChatSession`; `selectSessionForDoc(docId)`; rehydration drops sessions without `documentId`
- `apps/fe/src/stores/assistant.test.ts` — extend
- `apps/fe/src/components/editor/extensions.ts` — register UniqueID
- `apps/fe/src/components/editor/editor.tsx` — accept `proposals` prop; install proposal-decorations plugin and feed via meta updates
- `apps/fe/src/components/doc/doc-surface.tsx` — read proposals for active doc; mount ReviewBar; provide accept/reject callbacks; auto-reject proposals whose target block is gone or modified
- `apps/fe/src/components/assistant/sidebar/*` — sessions list shows doc title/emoji; remove "new chat" affordance; clicking a session navigates to its doc

---

## Task 1: Add stable block IDs to Tiptap (UniqueID extension)

**Files:**

- Create: `apps/fe/src/components/editor/unique-id.ts`
- Create: `apps/fe/src/components/editor/unique-id.test.ts`
- Modify: `apps/fe/src/components/editor/extensions.ts`

The extension adds an `id` attribute to every block-level node (any node where `group` includes `block`). On every transaction, it scans for block nodes lacking an `id` and stamps a fresh `nanoid(8)` via a single follow-up transaction. IDs persist into `contentJson` (because attributes round-trip through `getJSON()`), so reload + autosave keep them stable.

- [ ] **Step 1: Write the failing test**

```ts
// apps/fe/src/components/editor/unique-id.test.ts
import { expect, test } from "vite-plus/test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "./unique-id";

function makeEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), UniqueID],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    },
  });
}

test("stamps ids on existing block nodes", () => {
  const editor = makeEditor();
  const json = editor.getJSON();
  const para = json.content?.[0];
  expect(para?.attrs?.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
  editor.destroy();
});

test("stamps ids on newly inserted blocks", () => {
  const editor = makeEditor();
  editor.commands.insertContent({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "h" }],
  });
  const json = editor.getJSON();
  const ids = (json.content ?? []).map((n) => n.attrs?.id);
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8}$/);
  expect(new Set(ids).size).toBe(ids.length);
  editor.destroy();
});

test("preserves existing ids on round-trip", () => {
  const editor = makeEditor();
  const before = editor.getJSON();
  editor.commands.setContent(before);
  const after = editor.getJSON();
  expect(after.content?.[0]?.attrs?.id).toBe(before.content?.[0]?.attrs?.id);
  editor.destroy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/components/editor/unique-id.test.ts`
Expected: FAIL — `Cannot find module './unique-id'`.

- [ ] **Step 3: Implement the extension**

```ts
// apps/fe/src/components/editor/unique-id.ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { nanoid } from "nanoid";

const KEY = new PluginKey("uniqueId");

export const UniqueID = Extension.create({
  name: "uniqueId",

  addGlobalAttributes() {
    return [
      {
        // Apply to every block-level node type registered in the schema.
        types: [],
        attributes: {
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-id"),
            renderHTML: (attrs) => (attrs.id ? { "data-id": attrs.id } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        appendTransaction: (_transactions, _oldState, newState) => {
          const tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (!node.type.isBlock) return;
            if (node.type.name === "doc") return;
            if (node.attrs.id) return;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: nanoid(8) });
            modified = true;
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
```

The empty `types: []` array gets populated at extension-create time by Tiptap. We need to opt every block type in. Simplest: drop the `addGlobalAttributes` approach and register the attribute via the plugin's `appendTransaction` only — IDs live on `node.attrs` regardless of whether the schema knows about them, because Tiptap's getJSON serializes all attrs. But attrs unknown to the schema get stripped. So we must declare the attribute on every block type.

Replace `types: []` with the actual block type names used by our extension set:

```ts
addGlobalAttributes() {
  return [
    {
      types: ["paragraph", "heading", "bulletList", "orderedList", "listItem", "taskList", "taskItem", "blockquote", "codeBlock", "horizontalRule", "callout"],
      attributes: {
        id: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-id"),
          renderHTML: (attrs) => (attrs.id ? { "data-id": attrs.id } : {}),
          keepOnSplit: false,
        },
      },
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/fe/src/components/editor/unique-id.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Register the extension**

```ts
// apps/fe/src/components/editor/extensions.ts — add import
import { UniqueID } from "./unique-id";

// inside buildExtensions(), append to the returned array:
return [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Placeholder.configure({
    /* unchanged */
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight.configure({ multicolor: false }),
  Image,
  CharacterCount,
  CalloutNode,
  SlashCommandsExtension,
  UniqueID,
];
```

- [ ] **Step 6: Verify the editor still mounts cleanly**

Run: `vp test apps/fe/src/components/editor` and `vp check`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/fe/src/components/editor/unique-id.ts apps/fe/src/components/editor/unique-id.test.ts apps/fe/src/components/editor/extensions.ts
git commit -m "feat(fe): stamp stable block ids on tiptap nodes"
```

---

## Task 2: BE — Tiptap JSON → Markdown-with-IDs serializer

**Files:**

- Create: `apps/be/src/lib/document-markdown.ts`
- Create: `apps/be/src/lib/document-markdown.test.ts`

Serializes a Tiptap JSON doc to Markdown where every top-level block is preceded by an HTML comment carrying its `id` attribute. The output is what gets prepended as a `text` content block on `user.message`.

- [ ] **Step 1: Write the failing test**

````ts
// apps/be/src/lib/document-markdown.test.ts
import { describe, expect, test } from "vite-plus/test";
import { documentJsonToMarkdown } from "./document-markdown";

describe("documentJsonToMarkdown", () => {
  test("renders heading + paragraph with id comments", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, id: "h1" },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [{ type: "text", text: "Hello world." }],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toBe(
      ["<!-- id:h1 -->", "# Title", "", "<!-- id:p1 -->", "Hello world.", ""].join("\n"),
    );
  });

  test("renders bullet list as a single block", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          attrs: { id: "ul1" },
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }],
            },
          ],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toBe(["<!-- id:ul1 -->", "- one", "- two", ""].join("\n"));
  });

  test("renders code block", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { id: "c1", language: "ts" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toBe(
      ["<!-- id:c1 -->", "```ts", "const x = 1;", "```", ""].join("\n"),
    );
  });

  test("renders inline marks (bold, italic, code, link)", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [
            { type: "text", text: "a " },
            { type: "text", marks: [{ type: "bold" }], text: "b" },
            { type: "text", text: " c " },
            { type: "text", marks: [{ type: "italic" }], text: "d" },
            { type: "text", text: " e " },
            { type: "text", marks: [{ type: "code" }], text: "f" },
            { type: "text", text: " " },
            { type: "text", marks: [{ type: "link", attrs: { href: "https://x" } }], text: "g" },
          ],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toContain("a **b** c *d* e `f` [g](https://x)");
  });

  test("skips blocks without an id by stamping a placeholder", () => {
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "no id" }] }],
    };
    const out = documentJsonToMarkdown(json);
    expect(out).toMatch(/^<!-- id:[A-Za-z0-9_-]{8} -->\nno id\n$/);
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/be/src/lib/document-markdown.test.ts`
Expected: FAIL — `Cannot find module './document-markdown'`.

- [ ] **Step 3: Implement the serializer**

````ts
// apps/be/src/lib/document-markdown.ts
import { nanoid } from "nanoid";

type JSONNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export function documentJsonToMarkdown(doc: JSONNode): string {
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return "";
  const out: string[] = [];
  for (const block of doc.content) {
    const id = (typeof block.attrs?.id === "string" && block.attrs.id) || nanoid(8);
    out.push(`<!-- id:${id} -->`);
    out.push(renderBlock(block));
    out.push("");
  }
  return out.join("\n");
}

function renderBlock(node: JSONNode): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${renderInline(node.content)}`;
    }
    case "paragraph":
      return renderInline(node.content);
    case "bulletList":
      return (node.content ?? [])
        .map((li) => `- ${renderInline(extractListItemPara(li))}`)
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ${renderInline(extractListItemPara(li))}`)
        .join("\n");
    case "taskList":
      return (node.content ?? [])
        .map((li) => {
          const checked = li.attrs?.checked === true ? "x" : " ";
          return `- [${checked}] ${renderInline(extractListItemPara(li))}`;
        })
        .join("\n");
    case "blockquote":
      return (node.content ?? []).map((c) => `> ${renderBlock(c)}`).join("\n");
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return ["```" + lang, renderInline(node.content), "```"].join("\n");
    }
    case "horizontalRule":
      return "---";
    case "callout": {
      const tone = typeof node.attrs?.tone === "string" ? node.attrs.tone : "info";
      return `> [!${tone}]\n> ${(node.content ?? []).map(renderBlock).join("\n> ")}`;
    }
    default:
      return renderInline(node.content);
  }
}

function extractListItemPara(li: JSONNode): JSONNode["content"] {
  // listItem usually wraps a paragraph; pull its inline content out.
  const para = (li.content ?? []).find((c) => c.type === "paragraph" || c.type === "taskList");
  return para?.content ?? li.content;
}

function renderInline(nodes: JSONNode["content"]): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text") return applyMarks(n.text ?? "", n.marks ?? []);
      if (n.type === "hardBreak") return "  \n";
      // Fallback for unknown inline-ish nodes: descend.
      return renderInline(n.content);
    })
    .join("");
}

function applyMarks(text: string, marks: NonNullable<JSONNode["marks"]>): string {
  let out = text;
  for (const m of marks) {
    switch (m.type) {
      case "bold":
        out = `**${out}**`;
        break;
      case "italic":
        out = `*${out}*`;
        break;
      case "code":
        out = `\`${out}\``;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "link": {
        const href = typeof m.attrs?.href === "string" ? m.attrs.href : "";
        out = `[${out}](${href})`;
        break;
      }
    }
  }
  return out;
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/be/src/lib/document-markdown.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add apps/be/src/lib/document-markdown.ts apps/be/src/lib/document-markdown.test.ts
git commit -m "feat(be): tiptap json -> markdown-with-ids serializer"
```

---

## Task 3: BE — Extract `translate()` into its own module + add propose\_\* handling

**Files:**

- Create: `apps/be/src/lib/assistant-translate.ts`
- Create: `apps/be/src/lib/assistant-translate.test.ts`
- Modify: `apps/be/src/routes/assistant.ts`

The current `translate()` function in [assistant.ts](../../apps/be/src/routes/assistant.ts) is inlined. Pulling it into its own module makes it unit-testable and is a prerequisite for adding the `propose_*` handling cleanly. We also extend the `WireEvent` union to include the new `proposal` event.

- [ ] **Step 1: Write the failing test (covers existing translations + new propose handling)**

```ts
// apps/be/src/lib/assistant-translate.test.ts
import { describe, expect, test } from "vite-plus/test";
import { translate, type WireEvent } from "./assistant-translate";

describe("translate (existing behavior)", () => {
  test("agent.message becomes message_start + text_delta", () => {
    const out = translate({
      type: "agent.message",
      id: "m1",
      processed_at: "2025-01-01T00:00:00Z",
      content: [{ type: "text", text: "hi" }],
    });
    expect(out).toEqual<WireEvent[]>([
      { type: "message_start", id: "m1", createdAt: Date.parse("2025-01-01T00:00:00Z") },
      { type: "text_delta", delta: "hi" },
    ]);
  });

  test("session.status_idle becomes message_end", () => {
    expect(translate({ type: "session.status_idle" })).toEqual<WireEvent[]>([
      { type: "message_end" },
    ]);
  });
});

describe("translate (propose_* custom tools)", () => {
  test("propose_replace_block becomes a proposal wire event", () => {
    const out = translate({
      type: "agent.custom_tool_use",
      id: "tu_1",
      name: "propose_replace_block",
      input: { block_id: "abc123", new_content_markdown: "**Hi**" },
    });
    expect(out).toHaveLength(1);
    const ev = out[0];
    expect(ev.type).toBe("proposal");
    if (ev.type !== "proposal") throw new Error("type narrow");
    expect(ev.kind).toBe("replace");
    expect(ev.blockId).toBe("abc123");
    expect(ev.content).toBe("**Hi**");
    expect(ev.toolUseId).toBe("tu_1");
    expect(ev.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });

  test("propose_insert_block_after with TOP", () => {
    const out = translate({
      type: "agent.custom_tool_use",
      id: "tu_2",
      name: "propose_insert_block_after",
      input: { after_block_id: "TOP", new_content_markdown: "# Intro" },
    });
    const ev = out[0];
    if (ev.type !== "proposal") throw new Error("type narrow");
    expect(ev.kind).toBe("insert_after");
    expect(ev.afterBlockId).toBe("TOP");
    expect(ev.content).toBe("# Intro");
  });

  test("propose_delete_block", () => {
    const out = translate({
      type: "agent.custom_tool_use",
      id: "tu_3",
      name: "propose_delete_block",
      input: { block_id: "xyz789" },
    });
    const ev = out[0];
    if (ev.type !== "proposal") throw new Error("type narrow");
    expect(ev.kind).toBe("delete");
    expect(ev.blockId).toBe("xyz789");
    expect(ev.content).toBeUndefined();
  });

  test("non-propose custom tools still produce activity events", () => {
    const out = translate({
      type: "agent.custom_tool_use",
      id: "tu_4",
      name: "search_web",
      input: { q: "x" },
    });
    expect(out).toEqual<WireEvent[]>([{ type: "activity", kind: "tool_use", label: "search_web" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/be/src/lib/assistant-translate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Move `translate` + `WireEvent` into the new module and add proposal handling**

```ts
// apps/be/src/lib/assistant-translate.ts
import { nanoid } from "nanoid";

export type WireEvent =
  | { type: "message_start"; id: string; createdAt: number }
  | { type: "text_delta"; delta: string }
  | {
      type: "activity";
      kind: "tool_use" | "tool_result" | "thinking" | "status";
      label: string;
      summary?: string;
    }
  | {
      type: "proposal";
      id: string;
      kind: "replace" | "insert_after" | "delete";
      blockId: string;
      afterBlockId?: string;
      content?: string;
      toolUseId: string;
    }
  | { type: "message_end"; usage?: { input_tokens: number; output_tokens: number } }
  | { type: "error"; message: string; retryable: boolean };

const PROPOSE_NAMES = new Set([
  "propose_replace_block",
  "propose_insert_block_after",
  "propose_delete_block",
]);

export function isProposeName(name: string): boolean {
  return PROPOSE_NAMES.has(name);
}

export function translate(ev: unknown): WireEvent[] {
  if (!ev || typeof ev !== "object" || !("type" in ev)) return [];
  const e = ev as { type: string; [k: string]: unknown };

  switch (e.type) {
    case "agent.message": {
      const id = typeof e.id === "string" ? e.id : `msg_${Date.now()}`;
      const processedAt = typeof e.processed_at === "string" ? Date.parse(e.processed_at) : NaN;
      const createdAt = Number.isFinite(processedAt) ? processedAt : Date.now();
      const blocks = Array.isArray(e.content)
        ? (e.content as Array<{ type?: string; text?: string }>)
        : [];
      const text = blocks
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");

      const out: WireEvent[] = [{ type: "message_start", id, createdAt }];
      if (text.length > 0) out.push({ type: "text_delta", delta: text });
      return out;
    }

    case "agent.thinking":
      return [{ type: "activity", kind: "thinking", label: "Thinking" }];

    case "agent.tool_use": {
      const name = typeof e.name === "string" ? e.name : "tool";
      return [{ type: "activity", kind: "tool_use", label: name }];
    }

    case "agent.mcp_tool_use": {
      const server = typeof e.mcp_server_name === "string" ? e.mcp_server_name : "mcp";
      const name = typeof e.name === "string" ? e.name : "tool";
      return [{ type: "activity", kind: "tool_use", label: `${server}/${name}` }];
    }

    case "agent.custom_tool_use": {
      const name = typeof e.name === "string" ? e.name : "custom_tool";
      const toolUseId = typeof e.id === "string" ? e.id : `tu_${Date.now()}`;
      const input = (e.input ?? {}) as Record<string, unknown>;

      if (name === "propose_replace_block") {
        return [
          {
            type: "proposal",
            id: nanoid(8),
            kind: "replace",
            blockId: String(input.block_id ?? ""),
            content:
              typeof input.new_content_markdown === "string" ? input.new_content_markdown : "",
            toolUseId,
          },
        ];
      }
      if (name === "propose_insert_block_after") {
        return [
          {
            type: "proposal",
            id: nanoid(8),
            kind: "insert_after",
            blockId: String(input.after_block_id ?? ""),
            afterBlockId: String(input.after_block_id ?? ""),
            content:
              typeof input.new_content_markdown === "string" ? input.new_content_markdown : "",
            toolUseId,
          },
        ];
      }
      if (name === "propose_delete_block") {
        return [
          {
            type: "proposal",
            id: nanoid(8),
            kind: "delete",
            blockId: String(input.block_id ?? ""),
            toolUseId,
          },
        ];
      }
      return [{ type: "activity", kind: "tool_use", label: name }];
    }

    case "agent.tool_result":
    case "agent.mcp_tool_result": {
      const isError = e.is_error === true;
      return [{ type: "activity", kind: "tool_result", label: isError ? "error" : "ok" }];
    }

    case "agent.thread_context_compacted":
      return [{ type: "activity", kind: "status", label: "Context compacted" }];

    case "session.status_rescheduled":
      return [{ type: "activity", kind: "status", label: "Rescheduled" }];

    case "span.model_request_end": {
      const usage = e.model_usage as
        | { input_tokens?: unknown; output_tokens?: unknown }
        | undefined;
      const summary =
        usage && typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number"
          ? `in=${usage.input_tokens} out=${usage.output_tokens}`
          : undefined;
      return [
        {
          type: "activity",
          kind: "status",
          label: "Model response",
          ...(summary ? { summary } : {}),
        },
      ];
    }

    case "session.status_idle":
    case "session.status_terminated":
    case "session.deleted":
      return [{ type: "message_end" }];

    case "session.error": {
      const err = e.error as { message?: unknown; retry_status?: { type?: unknown } } | undefined;
      const message = err && typeof err.message === "string" ? err.message : "session_error";
      const retryStatus =
        err && err.retry_status && typeof err.retry_status.type === "string"
          ? err.retry_status.type
          : "";
      const retryable = retryStatus === "retrying";
      return [{ type: "error", message, retryable }];
    }

    default:
      return [];
  }
}
```

- [ ] **Step 4: Run translator tests**

Run: `vp test apps/be/src/lib/assistant-translate.test.ts`
Expected: PASS (6 passing).

- [ ] **Step 5: Replace inline `translate` + types in assistant.ts**

In [assistant.ts](../../apps/be/src/routes/assistant.ts):

1. Delete the local `WireEvent` type (lines ~15-25) and the `translate` function (lines ~94-192).
2. Add at top: `import { translate, type WireEvent } from "../lib/assistant-translate";`
3. Verify the existing `encodeSSE(event: WireEvent)` still type-checks against the imported type.

- [ ] **Step 6: Run BE tests + check**

Run: `vp test apps/be && vp check`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/be/src/lib/assistant-translate.ts apps/be/src/lib/assistant-translate.test.ts apps/be/src/routes/assistant.ts
git commit -m "feat(be): translate propose_* tool calls into proposal wire events"
```

---

## Task 4: BE — Accept `documentId` on send body, prepend doc Markdown

**Files:**

- Modify: `apps/be/src/routes/assistant.ts`

The send-message route loads the doc by `(documentId, userId)` from D1, serializes it via `documentJsonToMarkdown`, and prepends it as a `text` content block on the `user.message`. Existing attachment handling is untouched.

This route is currently unguarded by `withAuth` (per the integration spec, "/assistant routes will adopt auth uniformly later"). For now we read `userId` from the same source that `/documents` uses — Task assumes `withAuth` already wraps `/assistant/sessions/:id/messages`. If it doesn't, this task adds it.

- [ ] **Step 1: Inspect the route and confirm auth posture**

Read [apps/be/src/routes/assistant.ts](../../apps/be/src/routes/assistant.ts) and [apps/be/src/middleware/auth.ts](../../apps/be/src/middleware/auth.ts).

If `/assistant` does not currently use `withAuth`, add `app.use("*", withAuth());` near the top of the router (mirroring `documents.ts`). The `documentId → doc` lookup needs `userId` on the context.

- [ ] **Step 2: Extend `SendBody` type**

```ts
// apps/be/src/routes/assistant.ts (near existing SendBody type)
type SendBody = {
  text: string;
  attachments: Attachment[];
  environmentId: string;
  documentId: string; // NEW — required
};
```

- [ ] **Step 3: Add doc-loading + Markdown injection inside the messages handler**

```ts
// apps/be/src/routes/assistant.ts — inside POST /sessions/:sessionId/messages
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/client";
import { documents } from "../db/schema";
import { documentJsonToMarkdown } from "../lib/document-markdown";

// ... existing body validation, after the early-return for invalid body:
if (typeof body.documentId !== "string" || body.documentId.length === 0) {
  return c.json({ error: "missing_document_id" }, 400);
}

const userId = c.get("userId");
const db = getDb(c.env.DB);
const docRow = (
  await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, body.documentId), eq(documents.userId, userId)))
    .limit(1)
)[0];
if (!docRow) return c.json({ error: "document_not_found" }, 404);

const docMarkdown = (() => {
  try {
    return documentJsonToMarkdown(JSON.parse(docRow.contentJson));
  } catch {
    return "";
  }
})();
```

Then change `toContentBlocks(body.text, body.attachments)` so the doc context is prepended:

```ts
const blocks = toContentBlocks(body.text, body.attachments);
const docContextBlock = {
  type: "text" as const,
  text:
    `You are editing this document. Each block is preceded by an HTML comment with its id.\n` +
    `Use the propose_replace_block / propose_insert_block_after / propose_delete_block tools ` +
    `to make changes; refer to blocks by the ids shown.\n\n` +
    `--- BEGIN DOCUMENT (id:${docRow.id}, title:${JSON.stringify(docRow.title)}) ---\n` +
    docMarkdown +
    `--- END DOCUMENT ---`,
};
const finalBlocks = [docContextBlock, ...blocks];

await client.beta.sessions.events.send(sessionId, {
  events: [{ type: "user.message", content: finalBlocks }],
});
```

Make sure the rest of the SSE-streaming code path is unchanged.

- [ ] **Step 4: Update existing manual smoke / type-check**

Run: `vp check && vp test apps/be`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/be/src/routes/assistant.ts
git commit -m "feat(be): inject document markdown into agent context per turn"
```

---

## Task 5: BE — Send `user.tool_result` immediately after each propose\_\* call

**Files:**

- Modify: `apps/be/src/routes/assistant.ts`

When the BE sees `agent.custom_tool_use` for one of the three propose names, it must send `user.tool_result { tool_use_id, content: "ok" }` back to Anthropic so the agent can continue streaming. The `proposal` wire event going out to the FE is independent of this.

- [ ] **Step 1: Modify the SSE-pipe loop in the messages handler**

Inside the `for await (const ev of stream)` loop in [assistant.ts](../../apps/be/src/routes/assistant.ts), before/around the `translate(ev)` call, intercept propose tool uses and fire-and-forget a `user.tool_result`:

```ts
// at top of file, alongside the other imports:
import { translate, type WireEvent } from "../lib/assistant-translate";
import { isProposeName } from "../lib/assistant-translate";

// inside POST /sessions/:sessionId/messages, around the stream loop:
const readable = new ReadableStream<Uint8Array>({
  async start(controller) {
    try {
      for await (const ev of stream) {
        // Auto-ack propose_* custom tool calls so the agent doesn't stall.
        if (
          ev &&
          typeof ev === "object" &&
          (ev as { type?: string }).type === "agent.custom_tool_use" &&
          typeof (ev as { name?: string }).name === "string" &&
          isProposeName((ev as { name: string }).name) &&
          typeof (ev as { id?: string }).id === "string"
        ) {
          const toolUseId = (ev as { id: string }).id;
          // Best-effort; surface failure as an error event but keep streaming.
          client.beta.sessions.events
            .send(sessionId, {
              events: [{ type: "user.tool_result", tool_use_id: toolUseId, content: "ok" }],
            })
            .catch(() => undefined);
        }
        for (const wire of translate(ev)) {
          controller.enqueue(encodeSSE(wire));
          if (wire.type === "message_end") {
            controller.close();
            return;
          }
        }
      }
      controller.enqueue(encodeSSE({ type: "message_end" }));
      controller.close();
    } catch (err) {
      controller.enqueue(
        encodeSSE({
          type: "error",
          message: err instanceof Error ? err.message : "stream_error",
          retryable: true,
        }),
      );
      controller.close();
    }
  },
});
```

The exact `user.tool_result` event shape may differ slightly across SDK versions — verify against `node_modules/@anthropic-ai/sdk/resources/beta/sessions/events.d.ts` and adjust the literal if needed. The semantic guarantee we need: a tool result tied to `tool_use_id` is sent, with non-error content.

- [ ] **Step 2: Type-check**

Run: `vp check`
Expected: PASS. If the tool_result shape is wrong, the SDK types will flag it.

- [ ] **Step 3: Commit**

```bash
git add apps/be/src/routes/assistant.ts
git commit -m "feat(be): auto-ack propose_* tool calls so agent keeps streaming"
```

---

## Task 6: FE — Markdown-to-HTML helper for applying proposals

**Files:**

- Create: `apps/fe/src/lib/markdown-to-html.ts`
- Create: `apps/fe/src/lib/markdown-to-html.test.ts`
- Modify: `apps/fe/package.json` — add `marked`

When applying an accepted proposal, the FE needs to convert the agent's Markdown content into something Tiptap can ingest. Tiptap parses HTML cleanly via `editor.commands.insertContent`, so we go Markdown → HTML.

- [ ] **Step 1: Add `marked` dep**

Run: `vp add marked --filter fe`
(`marked` is small (~30 KB) and well-maintained. Pinning a recent v12+ is fine.)

- [ ] **Step 2: Write the failing test**

````ts
// apps/fe/src/lib/markdown-to-html.test.ts
import { expect, test } from "vite-plus/test";
import { markdownToHtml } from "./markdown-to-html";

test("renders heading", () => {
  expect(markdownToHtml("# Title")).toContain("<h1>Title</h1>");
});

test("renders paragraph with bold", () => {
  expect(markdownToHtml("Hello **world**")).toMatch(/<p>Hello <strong>world<\/strong><\/p>/);
});

test("renders bullet list", () => {
  const html = markdownToHtml("- a\n- b");
  expect(html).toMatch(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
});

test("renders code block", () => {
  expect(markdownToHtml("```ts\nconst x = 1;\n```")).toContain("<code");
});

test("strips a trailing block of HTML comments (id markers)", () => {
  expect(markdownToHtml("<!-- id:abc -->\n# Title")).toContain("<h1>Title</h1>");
});
````

- [ ] **Step 3: Run test to verify it fails**

Run: `vp test apps/fe/src/lib/markdown-to-html.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// apps/fe/src/lib/markdown-to-html.ts
import { marked } from "marked";

const renderer = new marked.Renderer();
// HTML comments containing `id:...` are our internal markers — drop them.
const originalHtml = renderer.html.bind(renderer);
renderer.html = function html(token) {
  const raw = typeof token === "string" ? token : (token.text ?? "");
  if (/^<!--\s*id:/.test(raw.trim())) return "";
  return originalHtml(token);
};

export function markdownToHtml(md: string): string {
  return marked.parse(md, { renderer, async: false }) as string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `vp test apps/fe/src/lib/markdown-to-html.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/lib/markdown-to-html.ts apps/fe/src/lib/markdown-to-html.test.ts apps/fe/package.json pnpm-lock.yaml
git commit -m "feat(fe): markdown-to-html helper for applying agent proposals"
```

---

## Task 7: FE — Proposals store

**Files:**

- Create: `apps/fe/src/stores/proposals.ts`
- Create: `apps/fe/src/stores/proposals.test.ts`

Per-doc pending proposals. Ephemeral (no persistence). Modeled after the existing `documents.ts` UI store pattern in [stores/documents.ts](../../apps/fe/src/stores/documents.ts).

- [ ] **Step 1: Write the failing test**

```ts
// apps/fe/src/stores/proposals.test.ts
import { describe, expect, test, beforeEach } from "vite-plus/test";
import { createProposalsStore, type Proposal } from "./proposals";

const make = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  kind: "replace",
  blockId: "b1",
  content: "**hi**",
  toolUseId: "tu1",
  createdAt: 0,
  ...over,
});

describe("proposals store", () => {
  let store: ReturnType<typeof createProposalsStore>;
  beforeEach(() => {
    store = createProposalsStore();
  });

  test("addProposal appends to a doc's list", () => {
    store.getState().addProposal("doc1", make());
    expect(store.getState().byDoc.doc1).toEqual([make()]);
  });

  test("multiple docs are isolated", () => {
    store.getState().addProposal("doc1", make({ id: "p1" }));
    store.getState().addProposal("doc2", make({ id: "p2" }));
    expect(store.getState().byDoc.doc1?.[0]?.id).toBe("p1");
    expect(store.getState().byDoc.doc2?.[0]?.id).toBe("p2");
  });

  test("removeProposal drops by id", () => {
    store.getState().addProposal("doc1", make({ id: "p1" }));
    store.getState().addProposal("doc1", make({ id: "p2" }));
    store.getState().removeProposal("doc1", "p1");
    expect(store.getState().byDoc.doc1?.map((p) => p.id)).toEqual(["p2"]);
  });

  test("clearProposals empties a doc", () => {
    store.getState().addProposal("doc1", make({ id: "p1" }));
    store.getState().clearProposals("doc1");
    expect(store.getState().byDoc.doc1 ?? []).toEqual([]);
  });

  test("removeProposalsByBlockId drops all proposals targeting a block", () => {
    store.getState().addProposal("doc1", make({ id: "p1", blockId: "b1" }));
    store.getState().addProposal("doc1", make({ id: "p2", blockId: "b1" }));
    store.getState().addProposal("doc1", make({ id: "p3", blockId: "b2" }));
    store.getState().removeProposalsByBlockId("doc1", "b1");
    expect(store.getState().byDoc.doc1?.map((p) => p.id)).toEqual(["p3"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/stores/proposals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/fe/src/stores/proposals.ts
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

export type Proposal = {
  id: string;
  kind: "replace" | "insert_after" | "delete";
  blockId: string;
  afterBlockId?: string;
  content?: string;
  toolUseId: string;
  createdAt: number;
};

export type ProposalsState = {
  byDoc: Record<string, Proposal[]>;
};

export type ProposalsActions = {
  addProposal: (docId: string, p: Proposal) => void;
  removeProposal: (docId: string, proposalId: string) => void;
  removeProposalsByBlockId: (docId: string, blockId: string) => void;
  clearProposals: (docId: string) => void;
};

export type ProposalsStore = ProposalsState & ProposalsActions;

export function createProposalsStore(): StoreApi<ProposalsStore> {
  return createStore<ProposalsStore>((set) => ({
    byDoc: {},
    addProposal: (docId, p) =>
      set((state) => ({
        byDoc: { ...state.byDoc, [docId]: [...(state.byDoc[docId] ?? []), p] },
      })),
    removeProposal: (docId, proposalId) =>
      set((state) => ({
        byDoc: {
          ...state.byDoc,
          [docId]: (state.byDoc[docId] ?? []).filter((p) => p.id !== proposalId),
        },
      })),
    removeProposalsByBlockId: (docId, blockId) =>
      set((state) => ({
        byDoc: {
          ...state.byDoc,
          [docId]: (state.byDoc[docId] ?? []).filter((p) => p.blockId !== blockId),
        },
      })),
    clearProposals: (docId) => set((state) => ({ byDoc: { ...state.byDoc, [docId]: [] } })),
  }));
}

export const proposalsStore = createProposalsStore();

export function useProposals<T>(selector: (s: ProposalsStore) => T): T {
  return useStore(proposalsStore, selector);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/fe/src/stores/proposals.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/stores/proposals.ts apps/fe/src/stores/proposals.test.ts
git commit -m "feat(fe): per-doc proposals store"
```

---

## Task 8: FE — Bind chat sessions to documents

**Files:**

- Modify: `apps/fe/src/stores/assistant.ts`
- Modify: `apps/fe/src/stores/assistant.test.ts`

`ChatSession` gets a `documentId: string` field. New action `selectSessionForDoc(docId)` either selects an existing session for that doc or creates one. On rehydrate, sessions without a `documentId` are dropped (early-stage app, acceptable per spec).

- [ ] **Step 1: Add a failing test**

In `apps/fe/src/stores/assistant.test.ts`, add:

```ts
test("selectSessionForDoc creates a new session if none exists for the doc", () => {
  const store = createAssistantStore();
  store.getState().selectSessionForDoc("doc1");
  const id = store.getState().selectedSessionId!;
  expect(store.getState().sessions[id].documentId).toBe("doc1");
});

test("selectSessionForDoc reuses an existing session for the same doc", () => {
  const store = createAssistantStore();
  store.getState().selectSessionForDoc("doc1");
  const first = store.getState().selectedSessionId;
  store.getState().selectSessionForDoc("doc1");
  expect(store.getState().selectedSessionId).toBe(first);
  expect(store.getState().order.length).toBe(1);
});

test("selectSessionForDoc switches to the doc's session", () => {
  const store = createAssistantStore();
  store.getState().selectSessionForDoc("doc1");
  const a = store.getState().selectedSessionId;
  store.getState().selectSessionForDoc("doc2");
  const b = store.getState().selectedSessionId;
  expect(a).not.toBe(b);
  store.getState().selectSessionForDoc("doc1");
  expect(store.getState().selectedSessionId).toBe(a);
});
```

(If the test file currently uses `assistantStore` exported from the module rather than `createAssistantStore`, adapt — the helper exists per the integration spec; if not, export it for testability.)

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/stores/assistant.test.ts`
Expected: FAIL — `selectSessionForDoc is not a function` or `documentId` missing on type.

- [ ] **Step 3: Update `ChatSession` type and `newSession`**

```ts
// apps/fe/src/stores/assistant.ts
export type ChatSession = {
  id: string;
  title: string;
  documentId: string; // NEW
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  anthropicSessionId: string | null;
  environmentId: string | null;
};

function newSession(documentId: string): ChatSession {
  const now = Date.now();
  return {
    id: nanoid(8),
    title: "New chat",
    documentId,
    messages: [],
    createdAt: now,
    updatedAt: now,
    anthropicSessionId: null,
    environmentId: null,
  };
}
```

- [ ] **Step 4: Add `selectSessionForDoc` action**

```ts
// inside createAssistantStore() set/get implementation:
selectSessionForDoc: (docId: string) =>
  set((state) => {
    const existing = state.order.find((id) => state.sessions[id]?.documentId === docId);
    if (existing) return { selectedSessionId: existing };
    const session = newSession(docId);
    return {
      sessions: { ...state.sessions, [session.id]: session },
      order: [...state.order, session.id],
      selectedSessionId: session.id,
    };
  }),
```

Add `selectSessionForDoc: (docId: string) => void;` to the `AssistantActions` type.

- [ ] **Step 5: Drop legacy sessions on rehydrate**

In the `persist` middleware config (existing `partialize` block), wire up an `onRehydrateStorage` filter:

```ts
// inside persist config
onRehydrateStorage: () => (state) => {
  if (!state) return;
  const validIds = state.order.filter((id) => {
    const s = state.sessions[id];
    return !!s && typeof s.documentId === "string" && s.documentId.length > 0;
  });
  state.order = validIds;
  state.sessions = Object.fromEntries(validIds.map((id) => [id, state.sessions[id]]));
  if (state.selectedSessionId && !state.sessions[state.selectedSessionId]) {
    state.selectedSessionId = null;
  }
},
```

- [ ] **Step 6: Update existing call sites that called `newSession()` with no args**

`createSession` (existing action) — what's the callsite shape now? If existing code calls `createSession()`, it has no doc context. Replace usages with `selectSessionForDoc`. If `createSession` is still useful for a "scratch chat" affordance, keep it but require a `documentId` parameter. Recommended: remove `createSession` entirely (the spec drops the "new chat" UI anyway).

Find and remove:

```bash
grep -rn 'createSession\b' apps/fe/src
```

Remove the action from `AssistantActions` and replace any UI callers in Task 12.

- [ ] **Step 7: Run tests and check**

Run: `vp test apps/fe/src/stores/assistant.test.ts && vp check`
Expected: PASS (existing + 3 new), no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/fe/src/stores/assistant.ts apps/fe/src/stores/assistant.test.ts
git commit -m "feat(fe): bind chat sessions to documents (selectSessionForDoc)"
```

---

## Task 9: FE — Extend assistant-api with documentId + `proposal` SSE event

**Files:**

- Modify: `apps/fe/src/lib/assistant-api.ts`
- Modify: existing assistant-api tests if any (path TBD — check `apps/fe/src/lib/`)

`sendMessage` body grows `documentId`. The SSE reader recognizes `proposal` events and dispatches via the existing `onEvent` callback shape used for activity events. The store wires the proposal events into the proposals store (next task).

- [ ] **Step 1: Inspect existing types and callback shape**

Read [apps/fe/src/lib/assistant-api.ts](../../apps/fe/src/lib/assistant-api.ts) and [apps/fe/src/lib/sse.ts](../../apps/fe/src/lib/sse.ts).

- [ ] **Step 2: Extend the `WireEvent` type in assistant-api to include `proposal`**

```ts
// apps/fe/src/lib/assistant-api.ts — alongside existing WireEvent definitions
export type ProposalEvent = {
  type: "proposal";
  id: string;
  kind: "replace" | "insert_after" | "delete";
  blockId: string;
  afterBlockId?: string;
  content?: string;
  toolUseId: string;
};

export type WireEvent =
  | MessageStartEvent
  | TextDeltaEvent
  | ActivityEvent
  | ProposalEvent
  | MessageEndEvent
  | ErrorEvent;
```

(Replace existing `WireEvent` union with the additive variant. Keep the other event types verbatim.)

- [ ] **Step 3: Add `documentId` to send body**

```ts
// apps/fe/src/lib/assistant-api.ts — inside the SendMessageBody type
export type SendMessageBody = {
  text: string;
  attachments: Attachment[];
  environmentId: string;
  documentId: string; // NEW
};
```

Update `streamMessage(...)` (or whatever the existing function is named) to pass `documentId` through unchanged in the JSON body.

- [ ] **Step 4: Verify SSE reader doesn't reject unknown event types**

Look at `lib/sse.ts`. If it whitelists event types, add `"proposal"`. If it just passes JSON through, no change.

- [ ] **Step 5: Type-check**

Run: `vp check`
Expected: PASS. (The `sendMessage` callsite in the assistant store will now be a type error if it doesn't pass `documentId`; that's fixed in Task 10.)

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/lib/assistant-api.ts apps/fe/src/lib/sse.ts
git commit -m "feat(fe): assistant-api accepts documentId and parses proposal events"
```

---

## Task 10: FE — Wire proposal events into the proposals store

**Files:**

- Modify: `apps/fe/src/stores/assistant.ts`

The assistant store's `sendMessage` action passes the active doc's id and routes incoming `proposal` events into the proposals store.

- [ ] **Step 1: Update `sendMessage` to require a documentId**

The session record already carries `documentId` (Task 8). Inside `sendMessage`, look up `session.documentId` and pass it to `streamMessage`. If somehow null, throw — should never happen because sessions can no longer be created without a doc.

- [ ] **Step 2: Dispatch proposal events into the proposals store**

```ts
// apps/fe/src/stores/assistant.ts (top of file)
import { proposalsStore } from "./proposals";

// inside the SSE event handler in sendMessage:
case "proposal": {
  proposalsStore.getState().addProposal(session.documentId, {
    id: ev.id,
    kind: ev.kind,
    blockId: ev.blockId,
    afterBlockId: ev.afterBlockId,
    content: ev.content,
    toolUseId: ev.toolUseId,
    createdAt: Date.now(),
  });
  break;
}
```

- [ ] **Step 3: Run tests + check**

Run: `vp test apps/fe/src/stores && vp check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/stores/assistant.ts
git commit -m "feat(fe): route proposal events into the proposals store"
```

---

## Task 11: FE — Inline proposal decorations (Tiptap plugin)

**Files:**

- Create: `apps/fe/src/components/editor/proposal-decorations.ts`
- Modify: `apps/fe/src/components/editor/editor.tsx`

A ProseMirror plugin renders proposals as inline decorations. The plugin holds a `Proposal[]` in its state, updated via meta transactions. For each proposal, it walks the doc, finds the node whose `attrs.id` matches `blockId`, and adds a widget decoration before/after/over the block.

The widgets are simple DOM nodes built imperatively (small overlays with Accept / Reject buttons). The buttons fire callbacks supplied via plugin state; the editor wrapper passes those callbacks down.

This task does not test in isolation (rendering ProseMirror plugins through JSDOM is brittle). Verification is via the smoke test in Task 14.

- [ ] **Step 1: Implement the plugin**

```ts
// apps/fe/src/components/editor/proposal-decorations.ts
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

export type ProposalForPlugin = {
  id: string;
  kind: "replace" | "insert_after" | "delete";
  blockId: string;
  afterBlockId?: string;
  content?: string;
};

export type ProposalCallbacks = {
  onAccept: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
  renderContent: (markdown: string) => string; // markdown -> sanitized HTML for preview only
};

export const proposalPluginKey = new PluginKey<{
  proposals: ProposalForPlugin[];
  cb: ProposalCallbacks;
}>("proposals");

export function buildProposalsPlugin(initialCallbacks: ProposalCallbacks): Plugin {
  return new Plugin({
    key: proposalPluginKey,
    state: {
      init: () => ({ proposals: [] as ProposalForPlugin[], cb: initialCallbacks }),
      apply(tr, prev) {
        const meta = tr.getMeta(proposalPluginKey) as
          | { proposals?: ProposalForPlugin[]; cb?: ProposalCallbacks }
          | undefined;
        if (!meta) return prev;
        return {
          proposals: meta.proposals ?? prev.proposals,
          cb: meta.cb ?? prev.cb,
        };
      },
    },
    props: {
      decorations(state) {
        const ps = proposalPluginKey.getState(state);
        if (!ps || ps.proposals.length === 0) return DecorationSet.empty;
        const decos: Decoration[] = [];
        for (const p of ps.proposals) {
          const target = findBlockById(state.doc, p.blockId);
          if (!target && p.kind !== "insert_after") continue;
          if (p.kind === "replace" && target) {
            decos.push(
              Decoration.node(target.pos, target.pos + target.node.nodeSize, {
                class: "proposal-replace",
              }),
            );
            decos.push(
              Decoration.widget(
                target.pos + target.node.nodeSize,
                () => buildPreviewWidget(p, ps.cb),
                { side: 1, key: `prop-${p.id}` },
              ),
            );
          } else if (p.kind === "delete" && target) {
            decos.push(
              Decoration.node(target.pos, target.pos + target.node.nodeSize, {
                class: "proposal-delete",
              }),
            );
            decos.push(
              Decoration.widget(
                target.pos + target.node.nodeSize,
                () => buildChipsWidget(p, ps.cb),
                { side: 1, key: `prop-${p.id}` },
              ),
            );
          } else if (p.kind === "insert_after") {
            const insertPos =
              p.afterBlockId === "TOP"
                ? 0
                : (() => {
                    const t = findBlockById(state.doc, p.afterBlockId ?? "");
                    return t ? t.pos + t.node.nodeSize : null;
                  })();
            if (insertPos === null) continue;
            decos.push(
              Decoration.widget(insertPos, () => buildPreviewWidget(p, ps.cb), {
                side: 0,
                key: `prop-${p.id}`,
              }),
            );
          }
        }
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}

function findBlockById(
  doc: import("@tiptap/pm/model").Node,
  id: string,
): { node: import("@tiptap/pm/model").Node; pos: number } | null {
  let found: { node: import("@tiptap/pm/model").Node; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs?.id === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function buildPreviewWidget(p: ProposalForPlugin, cb: ProposalCallbacks): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "proposal-preview";
  wrap.dataset.proposalId = p.id;

  const preview = document.createElement("div");
  preview.className = "proposal-preview-body";
  preview.innerHTML = cb.renderContent(p.content ?? "");
  wrap.appendChild(preview);

  wrap.appendChild(buildChipsWidget(p, cb));
  return wrap;
}

function buildChipsWidget(p: ProposalForPlugin, cb: ProposalCallbacks): HTMLElement {
  const chips = document.createElement("div");
  chips.className = "proposal-chips";

  const accept = document.createElement("button");
  accept.type = "button";
  accept.textContent = "Accept";
  accept.className = "proposal-accept";
  accept.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb.onAccept(p.id);
  });

  const reject = document.createElement("button");
  reject.type = "button";
  reject.textContent = "Reject";
  reject.className = "proposal-reject";
  reject.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb.onReject(p.id);
  });

  chips.appendChild(accept);
  chips.appendChild(reject);
  return chips;
}

export function pushProposalsToView(
  view: EditorView,
  next: ProposalForPlugin[],
  cb: ProposalCallbacks,
): void {
  view.dispatch(view.state.tr.setMeta(proposalPluginKey, { proposals: next, cb }));
}
```

- [ ] **Step 2: Add CSS for the decorations**

Append to `apps/fe/src/styles.css`:

```css
.proposal-replace {
  background: rgba(34, 197, 94, 0.08);
  border-left: 2px solid rgba(34, 197, 94, 0.6);
}
.proposal-delete {
  background: rgba(239, 68, 68, 0.08);
  text-decoration: line-through;
  opacity: 0.7;
}
.proposal-preview {
  margin: 0.25rem 0;
  padding: 0.5rem 0.75rem;
  border-left: 2px solid rgba(34, 197, 94, 0.6);
  background: rgba(34, 197, 94, 0.04);
  border-radius: 0 4px 4px 0;
}
.proposal-chips {
  display: inline-flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.proposal-chips button {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--ink-faint);
  background: white;
  cursor: pointer;
}
.proposal-accept:hover {
  background: rgba(34, 197, 94, 0.1);
}
.proposal-reject:hover {
  background: rgba(239, 68, 68, 0.1);
}
```

- [ ] **Step 3: Wire the plugin into the editor**

```ts
// apps/fe/src/components/editor/editor.tsx — extend EditorProps + use plugin
import { buildProposalsPlugin, pushProposalsToView, type ProposalCallbacks, type ProposalForPlugin } from "./proposal-decorations";

export type EditorProps = {
  docId: string;
  initialContent: JSONContent;
  onChange: (change: EditorChange) => void;
  onBlur?: () => void;
  proposals: ProposalForPlugin[];
  proposalCallbacks: ProposalCallbacks;
};

export function Editor({ docId, initialContent, onChange, onBlur, proposals, proposalCallbacks }: EditorProps) {
  const extensions = useMemo(() => buildExtensions(), []);
  // ...existing onChangeRef setup...

  const proposalsPlugin = useMemo(() => buildProposalsPlugin(proposalCallbacks), []);
  const callbacksRef = useRef(proposalCallbacks);
  useEffect(() => {
    callbacksRef.current = proposalCallbacks;
  }, [proposalCallbacks]);

  const editor = useEditor(
    {
      extensions: [...extensions, /* leave as-is, plugin attached via editorProps below */],
      content: initialContent,
      // ... existing config ...
      editorProps: {
        attributes: {
          class:
            "prose prose-slate max-w-none focus:outline-none text-[16px] leading-[1.7] text-(--ink)",
        },
        // attach the plugin
        // (Tiptap's plugin registration is via Extension.create + addProseMirrorPlugins;
        // simpler: attach via editor.registerPlugin once the editor is ready.)
        handleDOMEvents: {
          blur: () => {
            onBlur?.();
            return false;
          },
        },
      },
      // ... existing onUpdate ...
    },
    [docId],
  );

  // Register plugin once on mount; push fresh proposals on every update.
  useEffect(() => {
    if (!editor) return;
    editor.registerPlugin(proposalsPlugin);
    return () => editor.unregisterPlugin(proposalsPlugin.spec.key!);
  }, [editor, proposalsPlugin]);

  useEffect(() => {
    if (!editor) return;
    pushProposalsToView(editor.view, proposals, callbacksRef.current);
  }, [editor, proposals]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `vp check`
Expected: PASS (callsites in `doc-surface.tsx` will now type-error because new required props missing — fixed in Task 13).

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/editor/proposal-decorations.ts apps/fe/src/components/editor/editor.tsx apps/fe/src/styles.css
git commit -m "feat(fe): inline proposal decorations as a tiptap plugin"
```

---

## Task 12: FE — Review bar component

**Files:**

- Create: `apps/fe/src/components/editor/review-bar.tsx`
- Create: `apps/fe/src/components/editor/review-bar.test.tsx`

A sticky strip rendered above the editor when proposals exist for the current doc. Shows the count and Accept-all / Reject-all buttons.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/fe/src/components/editor/review-bar.test.tsx
import { expect, test, vi } from "vite-plus/test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewBar } from "./review-bar";

test("renders count + buttons when there are proposals", () => {
  render(<ReviewBar count={3} onAcceptAll={() => {}} onRejectAll={() => {}} />);
  expect(screen.getByText(/3 changes/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /accept all/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /reject all/i })).toBeTruthy();
});

test("returns null when count is 0", () => {
  const { container } = render(
    <ReviewBar count={0} onAcceptAll={() => {}} onRejectAll={() => {}} />,
  );
  expect(container.firstChild).toBeNull();
});

test("invokes callbacks on click", () => {
  const onA = vi.fn();
  const onR = vi.fn();
  render(<ReviewBar count={2} onAcceptAll={onA} onRejectAll={onR} />);
  fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
  fireEvent.click(screen.getByRole("button", { name: /reject all/i }));
  expect(onA).toHaveBeenCalledOnce();
  expect(onR).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/components/editor/review-bar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/fe/src/components/editor/review-bar.tsx
type Props = {
  count: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
};

export function ReviewBar({ count, onAcceptAll, onRejectAll }: Props) {
  if (count <= 0) return null;
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-(--ink-faint) bg-white/95 px-6 py-2 text-[14px] backdrop-blur">
      <span className="text-(--ink-soft)">
        Agent proposed {count} {count === 1 ? "change" : "changes"}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRejectAll}
          className="rounded border border-(--ink-faint) px-3 py-1 hover:bg-(--ink-faint)/30"
        >
          Reject all
        </button>
        <button
          type="button"
          onClick={onAcceptAll}
          className="rounded bg-(--ink) px-3 py-1 text-white hover:opacity-90"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/fe/src/components/editor/review-bar.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/editor/review-bar.tsx apps/fe/src/components/editor/review-bar.test.tsx
git commit -m "feat(fe): review-bar with accept-all / reject-all"
```

---

## Task 13: FE — Wire it all together in doc-surface

**Files:**

- Modify: `apps/fe/src/components/doc/doc-surface.tsx`

Mount the review bar; subscribe to proposals for the active doc; provide accept/reject callbacks that mutate the editor and feed `useUpdateDoc.schedule`. Detect user edits to a proposed block and auto-reject those proposals.

- [ ] **Step 1: Subscribe to proposals for active doc**

```tsx
// apps/fe/src/components/doc/doc-surface.tsx — augment DocSurface()
import { useProposals, proposalsStore, type Proposal } from "#/stores/proposals";
import { ReviewBar } from "#/components/editor/review-bar";
import { markdownToHtml } from "#/lib/markdown-to-html";

const proposals = useProposals((s) => (doc ? (s.byDoc[doc.id] ?? []) : []));
```

- [ ] **Step 2: Build accept/reject handlers and the editor callbacks object**

Inside `DocSurface`, after the existing `useUpdateDoc` block:

```tsx
const editorRef = useRef<{ view: EditorView } | null>(null); // from @tiptap/pm/view

const acceptProposal = useCallback(
  (proposalId: string) => {
    if (!doc) return;
    const list = proposalsStore.getState().byDoc[doc.id] ?? [];
    const p = list.find((x) => x.id === proposalId);
    if (!p) return;
    applyProposalToEditor(p, editorRef.current);
    proposalsStore.getState().removeProposal(doc.id, proposalId);
    // The editor's onUpdate already calls updater.schedule with the new JSON.
  },
  [doc],
);

const rejectProposal = useCallback(
  (proposalId: string) => {
    if (!doc) return;
    proposalsStore.getState().removeProposal(doc.id, proposalId);
  },
  [doc],
);

const acceptAll = useCallback(() => {
  if (!doc) return;
  const list = [...(proposalsStore.getState().byDoc[doc.id] ?? [])];
  // Apply in document order so insert positions stay sensible.
  list.sort((a, b) => orderInDoc(a, b, editorRef.current));
  for (const p of list) applyProposalToEditor(p, editorRef.current);
  proposalsStore.getState().clearProposals(doc.id);
}, [doc]);

const rejectAll = useCallback(() => {
  if (!doc) return;
  proposalsStore.getState().clearProposals(doc.id);
}, [doc]);

const proposalCallbacks = useMemo(
  () => ({
    onAccept: acceptProposal,
    onReject: rejectProposal,
    renderContent: (md: string) => markdownToHtml(md),
  }),
  [acceptProposal, rejectProposal],
);
```

- [ ] **Step 3: Implement the apply helpers**

```tsx
// inside doc-surface.tsx (or pull to apps/fe/src/lib/apply-proposal.ts if it grows)
import type { EditorView } from "@tiptap/pm/view";

function applyProposalToEditor(p: Proposal, ref: { view: EditorView } | null): void {
  if (!ref) return;
  const { view } = ref;
  const target = findBlockPos(view, p.blockId);
  if (p.kind === "replace") {
    if (!target) return;
    const html = markdownToHtml(p.content ?? "");
    view.dispatch(
      view.state.tr.replaceWith(
        target.pos,
        target.pos + target.size,
        view.state.schema.nodeFromJSON({ type: "paragraph" }), // placeholder, see note below
      ),
    );
    // Replacing via raw nodes is fragile across schemas. Easier path:
    // serialize html into ProseMirror nodes via the dom parser:
    const { DOMParser } = require("@tiptap/pm/model");
    const dom = document.createElement("div");
    dom.innerHTML = html;
    const slice = DOMParser.fromSchema(view.state.schema).parseSlice(dom);
    view.dispatch(view.state.tr.replace(target.pos, target.pos + target.size, slice));
    return;
  }
  if (p.kind === "delete") {
    if (!target) return;
    view.dispatch(view.state.tr.delete(target.pos, target.pos + target.size));
    return;
  }
  if (p.kind === "insert_after") {
    const insertPos =
      p.afterBlockId === "TOP"
        ? 0
        : (() => {
            const t = findBlockPos(view, p.afterBlockId ?? "");
            return t ? t.pos + t.size : null;
          })();
    if (insertPos === null) return;
    const { DOMParser } = require("@tiptap/pm/model");
    const dom = document.createElement("div");
    dom.innerHTML = markdownToHtml(p.content ?? "");
    const slice = DOMParser.fromSchema(view.state.schema).parseSlice(dom);
    view.dispatch(view.state.tr.replace(insertPos, insertPos, slice));
  }
}

function findBlockPos(view: EditorView, id: string): { pos: number; size: number } | null {
  let found: { pos: number; size: number } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs?.id === id) {
      found = { pos, size: node.nodeSize };
      return false;
    }
    return true;
  });
  return found;
}

function orderInDoc(a: Proposal, b: Proposal, ref: { view: EditorView } | null): number {
  if (!ref) return 0;
  const ap = findBlockPos(ref.view, a.blockId)?.pos ?? Number.MAX_SAFE_INTEGER;
  const bp = findBlockPos(ref.view, b.blockId)?.pos ?? Number.MAX_SAFE_INTEGER;
  return ap - bp;
}
```

(Replace the `require` with proper top-of-file imports: `import { DOMParser } from "@tiptap/pm/model";`)

- [ ] **Step 4: Auto-reject proposals when their target block is edited or removed**

In `DocSurface`, take a snapshot of proposed-blocks' content text on every render and compare against the current doc:

```tsx
const initialContentJsonRef = useRef<string | null>(null);

const handleEditorChange = useCallback(
  ({ json, title }: { json: JSONContent; title: string }) => {
    // Existing patch scheduling logic stays.
    const patch: { contentJson: JSONContent; title?: string } = { contentJson: json };
    if (title && title !== lastSent.titleHeading) {
      patch.title = title;
      setLastSent({ titleHeading: title });
    }
    updater.schedule(patch);

    // Auto-reject proposals whose target block disappeared OR whose content changed
    // since the proposal was created.
    if (!doc) return;
    const currentList = proposalsStore.getState().byDoc[doc.id] ?? [];
    if (currentList.length === 0) return;
    const blockIds = new Set<string>();
    walkBlocks(json, (block) => {
      if (typeof block.attrs?.id === "string") blockIds.add(block.attrs.id);
    });
    for (const p of currentList) {
      if (!blockIds.has(p.blockId) && p.kind !== "insert_after") {
        proposalsStore.getState().removeProposal(doc.id, p.id);
      }
    }
    // Per-block content-edit detection is harder; v1 only auto-rejects on disappearance.
    // Spec calls for auto-rejection on user edit too — track that as a follow-up.
  },
  [doc, lastSent, updater],
);

// helper:
function walkBlocks(node: JSONContent, visit: (block: JSONContent) => void): void {
  if (!node.content) return;
  for (const child of node.content) {
    visit(child);
    walkBlocks(child, visit);
  }
}
```

(Note: the spec wants auto-rejection on **edit**, not just on disappearance. Implementing edit-detection robustly across Tiptap transactions is fiddly. For v1 we ship the simpler "disappearance" rule; a follow-up task can add per-block content-hash tracking. The smoke-test step in Task 14 verifies this is acceptable; if not, scope it back in.)

- [ ] **Step 5: Render the review bar and pass props to Editor**

```tsx
return (
  <div className="mx-auto w-full max-w-170 px-6 pt-20 pb-24">
    <ReviewBar count={proposals.length} onAcceptAll={acceptAll} onRejectAll={rejectAll} />
    <Editor
      docId={doc.id}
      initialContent={initial}
      onChange={handleEditorChange}
      onBlur={() => {
        void updater.flush();
      }}
      proposals={proposals}
      proposalCallbacks={proposalCallbacks}
    />
  </div>
);
```

The editor needs to expose its underlying `view` so `applyProposalToEditor` can dispatch transactions. Easiest: have `Editor` accept an `onReady?: (api: { view: EditorView }) => void` callback fired when the editor mounts.

```tsx
// editor.tsx — add to EditorProps + fire on mount
useEffect(() => {
  if (!editor) return;
  onReady?.({ view: editor.view });
}, [editor, onReady]);
```

In doc-surface:

```tsx
const editorRef = useRef<{ view: EditorView } | null>(null);
const onEditorReady = useCallback((api: { view: EditorView }) => {
  editorRef.current = api;
}, []);

// pass onReady={onEditorReady} to <Editor />
```

- [ ] **Step 6: Run all FE tests + check**

Run: `vp test apps/fe && vp check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/fe/src/components/doc/doc-surface.tsx apps/fe/src/components/editor/editor.tsx
git commit -m "feat(fe): mount review bar and apply accepted proposals to the editor"
```

---

## Task 14: FE — Make the assistant pane track the active doc

**Files:**

- Modify: `apps/fe/src/components/doc/doc-surface.tsx` (or wherever doc selection occurs)
- Modify: `apps/fe/src/components/assistant/sidebar/*` (rename / list change)
- Modify: any code calling the removed `createSession()`

Whenever the active doc changes, call `selectSessionForDoc(docId)`. The sidebar's session list now displays each session's doc title/emoji and removes the "new chat" affordance.

- [ ] **Step 1: Auto-select the doc's chat when the doc selection changes**

```tsx
// apps/fe/src/components/doc/doc-surface.tsx
import { useAssistant } from "#/stores/assistant";

const selectSessionForDoc = useAssistant((s) => s.selectSessionForDoc);

useEffect(() => {
  if (!doc) return;
  selectSessionForDoc(doc.id);
}, [doc?.id, selectSessionForDoc]);
```

- [ ] **Step 2: Update the sessions sidebar to show the doc per session**

Inspect `apps/fe/src/components/assistant/sidebar/*`. Wherever each session row is rendered, look up its `documentId` in the documents query (`useDocumentsQuery(user.id)`) and render that doc's emoji + title. Sessions whose doc has been deleted should be hidden (or pruned via the rehydrate filter — Task 8 already drops sessions without a `documentId`, but doesn't drop sessions whose doc was deleted; add a small effect that prunes them when the docs list lands).

- [ ] **Step 3: Remove "new chat" UI**

Find any button or menu item that fires `createSession()`. Delete it; remove the unused export from the assistant store.

```bash
grep -rn 'createSession\b' apps/fe/src
```

- [ ] **Step 4: When user clicks a session in the sidebar, navigate to its doc**

```tsx
const selectDoc = useDocuments((s) => s.selectDoc);
// onClick session: selectDoc(session.documentId);  // doc-surface's effect then runs selectSessionForDoc and the assistant pane updates.
```

- [ ] **Step 5: Run FE tests + check**

Run: `vp test apps/fe && vp check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/components/doc/doc-surface.tsx apps/fe/src/components/assistant/sidebar
git commit -m "feat(fe): assistant pane follows the active doc; sidebar lists doc-chats"
```

---

## Task 15: Manual smoke verification

**Files:** none (this is a verification step).

- [ ] **Step 1: Configure custom tools on the Anthropic agent**

Per the pre-requisite at the top of this plan. Verify with `wrangler tail` (BE) that custom_tool_use events arrive when the agent is asked to edit.

- [ ] **Step 2: Start dev servers**

```bash
vp run be#dev
vp run fe#dev
```

- [ ] **Step 3: Walk the end-to-end smoke checklist from the spec**

For each, observe the expected outcome and capture a screenshot if behavior is unexpected:

- [ ] Open a doc → open assistant → "make the intro punchier" → proposals appear inline → Accept one, Reject one → autosave finishes → reload → state matches.
- [ ] "Add a new section called 'Risks' after Background" → `propose_insert_block_after` overlay shows in the right spot → Accept.
- [ ] "Delete the paragraph about pricing" → red-strikethrough overlay → Accept.
- [ ] While proposals are pending, edit a proposed block yourself → that proposal disappears (auto-rejected); others remain.
- [ ] Switch docs mid-stream → proposals for the previous doc stay attached; switching back shows them; the new doc's chat is selected.
- [ ] Generate 5 proposals → "5 changes" review bar appears → Accept-all applies all five in document order; doc autosaves once.
- [ ] `vp check` and `vp test` are clean (BE and FE).

- [ ] **Step 4: If anything fails, file a follow-up issue rather than expanding this plan.**

---

## Self-review notes

- All spec sections (Tool surface, Block IDs, Wire format, BE flow, FE stores, Editor integration, Apply logic, Concurrency & staleness, Persistence, Reload behavior) are covered by Tasks 1-14.
- Concurrency note: spec calls for auto-rejection on **user edit** of a proposed block, not just on disappearance. Task 13 ships the disappearance variant only and explicitly notes the gap as a follow-up. If reviewer wants the stricter version in v1, add a sub-task that snapshots `block.textContent` per pending proposal at proposal-time and compares on each editor update.
- The `EditorView`-via-ref handoff in Task 13 is the riskiest seam (Tiptap doesn't natively expose a ref API). If the simpler `editor.view` access through Tiptap's `Editor` instance is preferred, restructure to pass the Tiptap `Editor` directly upward — same outcome, fewer hops.
