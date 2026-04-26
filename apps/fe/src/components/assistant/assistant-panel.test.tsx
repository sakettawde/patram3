import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { assistantStore } from "#/stores/assistant";
import { AssistantPanel } from "./assistant-panel";

vi.mock("#/lib/assistant-api", () => ({
  createSession: vi.fn(async () => ({ sessionId: "asid", environmentId: "eid" })),
  uploadFile: vi.fn(),
  streamMessage: vi.fn(
    async (_sid: string, _body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
      opts.onEvent({ type: "text_delta", delta: "ok" });
      opts.onEvent({ type: "message_end" });
    },
  ),
  cancel: vi.fn(),
}));

describe("<AssistantPanel />", () => {
  beforeEach(() => {
    localStorage.clear();
    assistantStore.setState({
      open: true,
      selectedSessionId: null,
      sessions: {},
      order: [],
      pendingSessionIds: {},
      streaming: null,
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("auto-creates a session on mount when none exists", () => {
    render(<AssistantPanel />);
    expect(assistantStore.getState().order.length).toBe(1);
    screen.getByText("Start a conversation");
  });

  test("typing + Enter sends a user message and shows the assistant reply", async () => {
    render(<AssistantPanel />);
    // Wait for the auto-created session to be available in the UI.
    await waitFor(() => screen.getByLabelText("Message"));
    const ta = screen.getByLabelText("Message") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "hello" } });
      fireEvent.keyDown(ta, { key: "Enter" });
    });
    expect(screen.getAllByText("hello").length).toBeGreaterThanOrEqual(1);
    expect(ta.value).toBe("");

    await waitFor(() => {
      const sid = assistantStore.getState().selectedSessionId!;
      const msgs = assistantStore.getState().sessions[sid]!.messages;
      expect(msgs).toHaveLength(2);
    });

    await waitFor(() => {
      screen.getByText("ok");
    });
  });

  test("Shift+Enter does NOT send", () => {
    render(<AssistantPanel />);
    const ta = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "draft" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    const sid = assistantStore.getState().selectedSessionId!;
    expect(assistantStore.getState().sessions[sid]!.messages).toHaveLength(0);
  });

  test("send button is disabled for empty/whitespace input", () => {
    render(<AssistantPanel />);
    const send = screen.getByLabelText("Send message") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const ta = screen.getByLabelText("Message");
    fireEvent.change(ta, { target: { value: "   " } });
    expect(send.disabled).toBe(true);
    fireEvent.change(ta, { target: { value: "ok" } });
    expect(send.disabled).toBe(false);
  });

  test("close button sets open=false", () => {
    render(<AssistantPanel />);
    fireEvent.click(screen.getByLabelText("Close assistant"));
    expect(assistantStore.getState().open).toBe(false);
  });

  test("renaming via header updates session title", () => {
    render(<AssistantPanel />);
    fireEvent.click(screen.getByLabelText("Rename session"));
    const input = screen.getByLabelText("Session title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const sid = assistantStore.getState().selectedSessionId!;
    expect(assistantStore.getState().sessions[sid]!.title).toBe("Renamed");
  });
});
