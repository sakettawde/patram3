import { describe, expect, test } from "vite-plus/test";
import { readSSE } from "./sse";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]!));
      else controller.close();
    },
  });
}

describe("readSSE", () => {
  test("parses one event per line and calls onEvent", async () => {
    const events: unknown[] = [];
    const stream = makeStream([
      'data: {"type":"message_start","id":"m1","createdAt":1}\n\n',
      'data: {"type":"text_delta","delta":"hi"}\n\n',
      'data: {"type":"message_end"}\n\n',
    ]);
    await readSSE(stream, { onEvent: (e) => events.push(e) });
    expect(events).toHaveLength(3);
    expect((events[1] as { delta: string }).delta).toBe("hi");
  });

  test("handles event split across chunks", async () => {
    const events: unknown[] = [];
    const stream = makeStream(['data: {"type":"text_d', 'elta","delta":"yo"}\n\n']);
    await readSSE(stream, { onEvent: (e) => events.push(e) });
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe("yo");
  });

  test("aborts when signal fires mid-stream", async () => {
    const events: unknown[] = [];
    const ac = new AbortController();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"type":"text_delta","delta":"a"}\n\n'));
        // Never close, never enqueue more.
      },
    });
    const p = readSSE(stream, { onEvent: (e) => events.push(e), signal: ac.signal });
    await Promise.resolve();
    ac.abort();
    await p; // should resolve, not reject
    expect(events).toHaveLength(1);
  });

  test("skips non-data lines and malformed json", async () => {
    const events: unknown[] = [];
    const stream = makeStream([
      ": comment\n\n",
      "data: not-json\n\n",
      'data: {"type":"message_end"}\n\n',
    ]);
    await readSSE(stream, { onEvent: (e) => events.push(e) });
    expect(events).toHaveLength(1);
  });
});
