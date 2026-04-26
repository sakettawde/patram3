import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createAssistantStore } from "./assistant";

// localStorage shim: the test environment does not expose a global localStorage.
// Using a simple in-memory map that mimics the localStorage API.
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } as Storage,
    writable: true,
  });
}

vi.mock("#/lib/assistant-api", () => {
  return {
    createSession: vi.fn(async () => ({ sessionId: "asid", environmentId: "eid" })),
    uploadFile: vi.fn(),
    streamMessage: vi.fn(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "text_delta", delta: "ok" });
        opts.onEvent({ type: "message_end" });
      },
    ),
    cancel: vi.fn(),
  };
});

describe("AssistantStore", () => {
  beforeEach(async () => {
    localStorage.clear();
    const apiMod = await import("#/lib/assistant-api");
    (apiMod.createSession as ReturnType<typeof vi.fn>).mockClear();
    (apiMod.streamMessage as ReturnType<typeof vi.fn>).mockClear();
    (apiMod.cancel as ReturnType<typeof vi.fn>).mockClear();
    // Restore default implementations in case a test overrode with mockImplementationOnce
    // on prior runs (each mockImplementationOnce only fires once, but reset to be safe).
    (apiMod.createSession as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      sessionId: "asid",
      environmentId: "eid",
    }));
    (apiMod.streamMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "text_delta", delta: "ok" });
        opts.onEvent({ type: "message_end" });
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("defaults: closed, no session", () => {
    const s = createAssistantStore();
    expect(s.getState().open).toBe(false);
    expect(s.getState().selectedSessionId).toBeNull();
    expect(s.getState().order).toEqual([]);
  });

  test("toggleOpen flips open", () => {
    const s = createAssistantStore();
    s.getState().toggleOpen();
    expect(s.getState().open).toBe(true);
    s.getState().toggleOpen();
    expect(s.getState().open).toBe(false);
  });

  test("selectSessionForDoc adds, selects, opens", () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    expect(s.getState().sessions[id]).toBeTruthy();
    expect(s.getState().sessions[id]!.title).toBe("New chat");
    expect(s.getState().sessions[id]!.messages).toEqual([]);
    expect(s.getState().sessions[id]!.documentId).toBe("doc-test");
    expect(s.getState().order).toContain(id);
    expect(s.getState().selectedSessionId).toBe(id);
    expect(s.getState().open).toBe(true);
  });

  test("selectSession sets selection and opens panel", () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-a");
    const a = s.getState().selectedSessionId!;
    s.getState().selectSessionForDoc("doc-b");
    const b = s.getState().selectedSessionId!;
    s.getState().setOpen(false);
    s.getState().selectSession(a);
    expect(s.getState().selectedSessionId).toBe(a);
    expect(s.getState().open).toBe(true);
    expect(s.getState().sessions[b]).toBeTruthy();
  });

  test("renameSession updates title; empty title falls back to 'New chat'", () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    s.getState().renameSession(id, "Plot ideas");
    expect(s.getState().sessions[id]!.title).toBe("Plot ideas");
    s.getState().renameSession(id, "  ");
    expect(s.getState().sessions[id]!.title).toBe("New chat");
  });

  test("deleteSession removes, advances selection to next-most-recent", () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-a");
    const a = s.getState().selectedSessionId!;
    s.getState().selectSessionForDoc("doc-b");
    const b = s.getState().selectedSessionId!;
    s.getState().deleteSession(b);
    expect(s.getState().sessions[b]).toBeUndefined();
    expect(s.getState().selectedSessionId).toBe(a);
  });

  test("deleteSession on last session leaves selectedSessionId null", () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    s.getState().deleteSession(id);
    expect(s.getState().selectedSessionId).toBeNull();
  });

  test("sendMessage appends user msg, then assistant reply via stream", async () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    await s.getState().sendMessage("hello");
    const session = s.getState().sessions[id]!;
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0]!.role).toBe("user");
    expect(session.messages[0]!.content).toBe("hello");
    expect(session.messages[1]!.role).toBe("assistant");
    expect(session.messages[1]!.content).toBe("ok");
    expect(s.getState().pendingSessionIds[id]).toBeUndefined();
  });

  test("sendMessage with no active session is a no-op", async () => {
    const s = createAssistantStore();
    await s.getState().sendMessage("hello");
    expect(s.getState().order).toEqual([]);
  });

  test("session title auto-derives from first user message", async () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    await s.getState().sendMessage("Outline my essay on quiet design");
    expect(s.getState().sessions[id]!.title).toBe("Outline my essay on quiet design");
  });

  test("session title does not change after second user message", async () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    await s.getState().sendMessage("First");
    await s.getState().sendMessage("Second");
    expect(s.getState().sessions[id]!.title).toBe("First");
  });

  test("two sends produce two assistant replies via streaming", async () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    await s.getState().sendMessage("one");
    await s.getState().sendMessage("two");
    const msgs = s.getState().sessions[id]!.messages;
    expect(msgs).toHaveLength(4);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("reply lands on the original session even after switch", async () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-a");
    const a = s.getState().selectedSessionId!;
    const sendPromise = s.getState().sendMessage("from a");
    s.getState().selectSessionForDoc("doc-b");
    const b = s.getState().selectedSessionId!;
    expect(s.getState().selectedSessionId).toBe(b);
    await sendPromise;
    expect(s.getState().sessions[a]!.messages).toHaveLength(2);
    expect(s.getState().sessions[b]!.messages).toHaveLength(0);
  });

  test("persists sessions and open state across instances", async () => {
    const a = createAssistantStore();
    a.getState().selectSessionForDoc("doc-test");
    await a.getState().sendMessage("hi");
    const b = createAssistantStore();
    expect(b.getState().order.length).toBe(1);
    expect(b.getState().open).toBe(true);
    const id = b.getState().order[0]!;
    expect(b.getState().sessions[id]!.messages).toHaveLength(2);
  });

  test("pendingSessionIds is NOT persisted (cleared after reload)", async () => {
    const apiMod = await import("#/lib/assistant-api");
    // Make the stream hang so pending stays true while we snapshot persisted state.
    (apiMod.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        await new Promise<void>((resolve) => {
          opts.signal?.addEventListener("abort", () => resolve());
        });
      },
    );
    const a = createAssistantStore();
    a.getState().selectSessionForDoc("doc-test");
    const id = a.getState().selectedSessionId!;
    const p = a.getState().sendMessage("in flight");
    // Allow microtasks to flush so pending bit is set.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(a.getState().pendingSessionIds[id]).toBe(true);
    const b = createAssistantStore();
    expect(b.getState().pendingSessionIds).toEqual({});
    // Clean up the hanging promise.
    a.getState().cancelStreaming();
    await p;
  });

  test("newly created sessions have null anthropicSessionId/environmentId", () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    const sess = s.getState().sessions[id];
    expect(sess?.anthropicSessionId).toBeNull();
    expect(sess?.environmentId).toBeNull();
  });

  test("messages may carry attachments metadata", () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    s.setState((st) => {
      const sess = st.sessions[id]!;
      return {
        sessions: {
          ...st.sessions,
          [id]: {
            ...sess,
            messages: [
              ...sess.messages,
              {
                id: "m1",
                role: "user",
                content: "see this",
                createdAt: 1,
                attachments: [{ kind: "image", fileId: "f1", name: "x.png", size: 10 }],
              },
            ],
          },
        },
      };
    });
    expect(s.getState().sessions[id]?.messages[0]?.attachments?.[0]?.kind).toBe("image");
  });

  test("streaming slot starts null and is not persisted", () => {
    const a = createAssistantStore();
    expect(a.getState().streaming).toBeNull();
    a.setState({
      streaming: {
        sessionId: "s",
        messageId: "m",
        text: "hi",
        activity: [],
        status: "streaming",
      },
    });
    // new instance from same storage → streaming reset
    const b = createAssistantStore();
    expect(b.getState().streaming).toBeNull();
  });

  test("sendMessage creates Anthropic session lazily on first send", async () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    await s.getState().sendMessage("hi");
    expect(s.getState().sessions[id]?.anthropicSessionId).toBe("asid");
    expect(s.getState().sessions[id]?.environmentId).toBe("eid");
  });

  test("Anthropic session is reused across sends (createSession called once)", async () => {
    const apiMod = await import("#/lib/assistant-api");
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    await s.getState().sendMessage("a");
    await s.getState().sendMessage("b");
    expect((apiMod.createSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  test("text_delta accumulates into streaming.text and message_end commits to messages", async () => {
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    await s.getState().sendMessage("hi");
    const sid = s.getState().selectedSessionId!;
    const msgs = s.getState().sessions[sid]!.messages;
    expect(msgs.at(-1)).toMatchObject({ role: "assistant", content: "ok" });
    expect(s.getState().streaming).toBeNull();
  });

  test("error event sets streaming.status=error", async () => {
    const apiMod = await import("#/lib/assistant-api");
    (apiMod.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_sid: string, _body: unknown, opts: { onEvent: (e: unknown) => void }) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "error", message: "boom", retryable: true });
      },
    );
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    await s.getState().sendMessage("hi");
    expect(s.getState().streaming?.status).toBe("error");
  });

  test("cancelStreaming keeps partial text as committed assistant message", async () => {
    const apiMod = await import("#/lib/assistant-api");
    (apiMod.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "text_delta", delta: "partial" });
        // Hang until cancelled.
        await new Promise<void>((resolve) => {
          opts.signal?.addEventListener("abort", () => resolve());
        });
      },
    );
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    const p = s.getState().sendMessage("hi");
    // Allow the stream mock to enqueue.
    await new Promise<void>((r) => setTimeout(r, 0));
    s.getState().cancelStreaming();
    await p;
    const last = s.getState().sessions[id]!.messages.at(-1)!;
    expect(last.role).toBe("assistant");
    expect(last.content).toBe("partial");
    expect(s.getState().streaming).toBeNull();
  });

  test("create-session failure sets streaming.error without adding messages", async () => {
    const apiMod = await import("#/lib/assistant-api");
    (apiMod.createSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network_down"),
    );
    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");
    const id = s.getState().selectedSessionId!;
    await s.getState().sendMessage("hi");
    expect(s.getState().sessions[id]!.messages).toHaveLength(0);
    expect(s.getState().streaming?.status).toBe("error");
    expect(s.getState().streaming?.errorMessage).toContain("network_down");
  });

  test("cancel-then-resend keeps the new stream cancellable", async () => {
    const apiMod = await import("#/lib/assistant-api");
    let secondAbortFired = false;

    // First stream: hang until aborted.
    (apiMod.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "text_delta", delta: "first-partial" });
        await new Promise<void>((r) => opts.signal?.addEventListener("abort", () => r()));
      },
    );

    // Second stream: hang and record whether its abort fires.
    (apiMod.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m2", createdAt: 2 });
        opts.onEvent({ type: "text_delta", delta: "second-partial" });
        await new Promise<void>((r) => {
          opts.signal?.addEventListener("abort", () => {
            secondAbortFired = true;
            r();
          });
        });
      },
    );

    const s = createAssistantStore();
    s.getState().selectSessionForDoc("doc-test");

    // Start first send and let the mock enqueue events.
    const p1 = s.getState().sendMessage("first");
    await new Promise<void>((r) => setTimeout(r, 0));

    // Cancel the first stream; its finally block runs asynchronously.
    s.getState().cancelStreaming();

    // Immediately start the second send BEFORE the first finally can run.
    const p2 = s.getState().sendMessage("second");
    await new Promise<void>((r) => setTimeout(r, 0));

    // Cancel the second stream — must fire even though the first finally
    // ran concurrently and tried to delete from streamControllers.
    s.getState().cancelStreaming();

    await Promise.all([p1, p2]);

    expect(secondAbortFired).toBe(true);
  });

  // ── New tests for selectSessionForDoc ──────────────────────────────────────

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
});
