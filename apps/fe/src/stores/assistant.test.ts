import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createAssistantStore } from "./assistant";

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

  test("createSession adds, selects, opens", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    expect(s.getState().sessions[id]).toBeTruthy();
    expect(s.getState().sessions[id]!.title).toBe("New chat");
    expect(s.getState().sessions[id]!.messages).toEqual([]);
    expect(s.getState().order).toContain(id);
    expect(s.getState().selectedSessionId).toBe(id);
    expect(s.getState().open).toBe(true);
  });

  test("selectSession sets selection and opens panel", () => {
    const s = createAssistantStore();
    const a = s.getState().createSession();
    const b = s.getState().createSession();
    s.getState().setOpen(false);
    s.getState().selectSession(a);
    expect(s.getState().selectedSessionId).toBe(a);
    expect(s.getState().open).toBe(true);
    expect(s.getState().sessions[b]).toBeTruthy();
  });

  test("renameSession updates title; empty title falls back to 'New chat'", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().renameSession(id, "Plot ideas");
    expect(s.getState().sessions[id]!.title).toBe("Plot ideas");
    s.getState().renameSession(id, "  ");
    expect(s.getState().sessions[id]!.title).toBe("New chat");
  });

  test("deleteSession removes, advances selection to next-most-recent", () => {
    const s = createAssistantStore();
    const a = s.getState().createSession();
    const b = s.getState().createSession();
    s.getState().deleteSession(b);
    expect(s.getState().sessions[b]).toBeUndefined();
    expect(s.getState().selectedSessionId).toBe(a);
  });

  test("deleteSession on last session leaves selectedSessionId null", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().deleteSession(id);
    expect(s.getState().selectedSessionId).toBeNull();
  });

  test("sendMessage appends user msg, then assistant reply via stream", async () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
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
    const id = s.getState().createSession();
    await s.getState().sendMessage("Outline my essay on quiet design");
    expect(s.getState().sessions[id]!.title).toBe("Outline my essay on quiet design");
  });

  test("session title does not change after second user message", async () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    await s.getState().sendMessage("First");
    await s.getState().sendMessage("Second");
    expect(s.getState().sessions[id]!.title).toBe("First");
  });

  test("two sends produce two assistant replies via streaming", async () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    await s.getState().sendMessage("one");
    await s.getState().sendMessage("two");
    const msgs = s.getState().sessions[id]!.messages;
    expect(msgs).toHaveLength(4);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("reply lands on the original session even after switch", async () => {
    const s = createAssistantStore();
    const a = s.getState().createSession();
    const sendPromise = s.getState().sendMessage("from a");
    const b = s.getState().createSession();
    expect(s.getState().selectedSessionId).toBe(b);
    await sendPromise;
    expect(s.getState().sessions[a]!.messages).toHaveLength(2);
    expect(s.getState().sessions[b]!.messages).toHaveLength(0);
  });

  test("persists sessions and open state across instances", async () => {
    const a = createAssistantStore();
    a.getState().createSession();
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
    const id = a.getState().createSession();
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
    const id = s.getState().createSession();
    const sess = s.getState().sessions[id];
    expect(sess?.anthropicSessionId).toBeNull();
    expect(sess?.environmentId).toBeNull();
  });

  test("messages may carry attachments metadata", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
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
    const id = s.getState().createSession();
    await s.getState().sendMessage("hi");
    expect(s.getState().sessions[id]?.anthropicSessionId).toBe("asid");
    expect(s.getState().sessions[id]?.environmentId).toBe("eid");
  });

  test("Anthropic session is reused across sends (createSession called once)", async () => {
    const apiMod = await import("#/lib/assistant-api");
    const s = createAssistantStore();
    s.getState().createSession();
    await s.getState().sendMessage("a");
    await s.getState().sendMessage("b");
    expect((apiMod.createSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  test("text_delta accumulates into streaming.text and message_end commits to messages", async () => {
    const s = createAssistantStore();
    s.getState().createSession();
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
    s.getState().createSession();
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
    const id = s.getState().createSession();
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
    const id = s.getState().createSession();
    await s.getState().sendMessage("hi");
    expect(s.getState().sessions[id]!.messages).toHaveLength(0);
    expect(s.getState().streaming?.status).toBe("error");
    expect(s.getState().streaming?.errorMessage).toContain("network_down");
  });
});
