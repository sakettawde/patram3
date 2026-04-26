import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { cancel, createSession, streamMessage, uploadFile } from "./assistant-api";

const ORIG_FETCH = globalThis.fetch;

describe("assistant-api", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = ORIG_FETCH;
  });

  test("createSession returns ids", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "s1", environmentId: "e1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await createSession("user1");
    expect(r).toEqual({ sessionId: "s1", environmentId: "e1" });
    const callArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((callArg.headers as Record<string, string>)?.["X-User-Id"]).toBe("user1");
  });

  test("uploadFile posts multipart", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ fileId: "f1", kind: "image", name: "x.png", size: 1 })),
    );
    const file = new File(["x"], "x.png", { type: "image/png" });
    const r = await uploadFile("user1", file);
    expect(r.fileId).toBe("f1");
    const callArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(callArg.body).toBeInstanceOf(FormData);
    expect((callArg.headers as Record<string, string>)?.["X-User-Id"]).toBe("user1");
  });

  test("streamMessage parses SSE events to onEvent", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"type":"text_delta","delta":"hi"}\n\n'));
        c.enqueue(enc.encode('data: {"type":"message_end"}\n\n'));
        c.close();
      },
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(body));
    const events: unknown[] = [];
    await streamMessage(
      "user1",
      "s1",
      { text: "hi", attachments: [], environmentId: "e1", documentId: "doc1" },
      { onEvent: (e) => events.push(e) },
    );
    expect(events).toHaveLength(2);
    const callArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((callArg.headers as Record<string, string>)?.["X-User-Id"]).toBe("user1");
  });

  test("streamMessage body includes documentId", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"type":"message_end"}\n\n'));
        c.close();
      },
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(body));
    await streamMessage(
      "user1",
      "s1",
      { text: "hi", attachments: [], environmentId: "e1", documentId: "doc42" },
      { onEvent: () => {} },
    );
    const callArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    const parsed = JSON.parse(callArg.body as string) as Record<string, unknown>;
    expect(parsed.documentId).toBe("doc42");
  });

  test("cancel posts to /cancel", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{"ok":true}'));
    await cancel("user1", "s1");
    expect(globalThis.fetch).toHaveBeenCalled();
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toMatch(/\/sessions\/s1\/cancel$/);
    const callArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((callArg.headers as Record<string, string>)?.["X-User-Id"]).toBe("user1");
  });
});
