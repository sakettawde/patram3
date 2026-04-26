import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  test("renders streaming bubble with text and activity strip", async () => {
    const api = await import("#/lib/assistant-api");
    (api.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_sid: string, _body: unknown, opts: { onEvent: (e: unknown) => void }) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "activity", kind: "thinking", label: "Thinking…" });
        opts.onEvent({ type: "text_delta", delta: "ok" });
        // hold without ending
        await new Promise(() => {});
      },
    );
    render(<AssistantPanel />);
    await userEvent.type(screen.getByLabelText("Message"), "hi{Enter}");
    await waitFor(() => expect(screen.getByText("ok")).toBeTruthy());
    expect(screen.getByText("Thinking…")).toBeTruthy();
  });

  test("stop button replaces send while streaming", async () => {
    const api = await import("#/lib/assistant-api");
    (api.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "text_delta", delta: "partial" });
        await new Promise<void>((resolve) =>
          opts.signal?.addEventListener("abort", () => resolve()),
        );
      },
    );
    render(<AssistantPanel />);
    await userEvent.type(screen.getByLabelText("Message"), "hi{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /stop response/i })).toBeTruthy(),
    );
    await userEvent.click(screen.getByRole("button", { name: /stop response/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /stop response/i })).toBeNull(),
    );
    expect(screen.getByText("partial")).toBeTruthy();
  });
});
