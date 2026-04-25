import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { assistantStore } from "#/stores/assistant";
import { AssistantPanel } from "./assistant-panel";

describe("<AssistantPanel />", () => {
  beforeEach(() => {
    localStorage.clear();
    assistantStore.setState({
      open: true,
      selectedSessionId: null,
      sessions: {},
      order: [],
      pendingSessionIds: {},
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("auto-creates a session on mount when none exists", () => {
    render(<AssistantPanel />);
    expect(assistantStore.getState().order.length).toBe(1);
    screen.getByText("Start a conversation");
  });

  test("typing + Enter sends a user message and shows the assistant reply after the timer", () => {
    render(<AssistantPanel />);
    const ta = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "hello" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(screen.getAllByText("hello").length).toBeGreaterThanOrEqual(1);
    expect(ta.value).toBe("");

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const sid = assistantStore.getState().selectedSessionId!;
    const msgs = assistantStore.getState().sessions[sid]!.messages;
    expect(msgs).toHaveLength(2);
    screen.getByText(msgs[1]!.content);
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
