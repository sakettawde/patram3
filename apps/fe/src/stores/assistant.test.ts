import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createAssistantStore } from "./assistant";

describe("AssistantStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
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
    expect(s.getState().sessions[id].title).toBe("New chat");
    expect(s.getState().sessions[id].messages).toEqual([]);
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
    expect(s.getState().sessions[id].title).toBe("Plot ideas");
    s.getState().renameSession(id, "  ");
    expect(s.getState().sessions[id].title).toBe("New chat");
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

  test("sendMessage appends user msg, sets pending; after timer appends assistant msg", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("hello");
    let session = s.getState().sessions[id]!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("user");
    expect(session.messages[0].content).toBe("hello");
    expect(s.getState().pendingSessionIds[id]).toBe(true);

    vi.advanceTimersByTime(1500);

    session = s.getState().sessions[id]!;
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1].role).toBe("assistant");
    expect(session.messages[1].content.length).toBeGreaterThan(0);
    expect(s.getState().pendingSessionIds[id]).toBeUndefined();
  });

  test("sendMessage with no active session is a no-op", () => {
    const s = createAssistantStore();
    s.getState().sendMessage("hello");
    expect(s.getState().order).toEqual([]);
  });

  test("session title auto-derives from first user message", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("Outline my essay on quiet design");
    expect(s.getState().sessions[id]!.title).toBe("Outline my essay on quiet design");
  });

  test("session title does not change after second user message", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("First");
    vi.advanceTimersByTime(1500);
    s.getState().sendMessage("Second");
    expect(s.getState().sessions[id]!.title).toBe("First");
  });

  test("reply lands on the original session even after switch", () => {
    const s = createAssistantStore();
    const a = s.getState().createSession();
    s.getState().sendMessage("from a");
    const b = s.getState().createSession();
    expect(s.getState().selectedSessionId).toBe(b);
    vi.advanceTimersByTime(1500);
    expect(s.getState().sessions[a]!.messages).toHaveLength(2);
    expect(s.getState().sessions[b]!.messages).toHaveLength(0);
  });

  test("pending reply for deleted session is dropped quietly", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("doomed");
    s.getState().deleteSession(id);
    expect(() => vi.advanceTimersByTime(1500)).not.toThrow();
    expect(s.getState().sessions[id]).toBeUndefined();
    expect(s.getState().pendingSessionIds[id]).toBeUndefined();
  });

  test("persists sessions and open state across instances", () => {
    const a = createAssistantStore();
    a.getState().createSession();
    a.getState().sendMessage("hi");
    vi.advanceTimersByTime(1500);
    const b = createAssistantStore();
    expect(b.getState().order.length).toBe(1);
    expect(b.getState().open).toBe(true);
    const id = b.getState().order[0]!;
    expect(b.getState().sessions[id]!.messages).toHaveLength(2);
  });

  test("pendingSessionIds is NOT persisted (cleared after reload)", () => {
    const a = createAssistantStore();
    const id = a.getState().createSession();
    a.getState().sendMessage("in flight");
    expect(a.getState().pendingSessionIds[id]).toBe(true);
    const b = createAssistantStore();
    expect(b.getState().pendingSessionIds).toEqual({});
  });
});
