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
