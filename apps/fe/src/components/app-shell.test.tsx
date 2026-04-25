import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { AppShell } from "./app-shell";
import { assistantStore } from "#/stores/assistant";
import { uiStore } from "#/stores/ui";

describe("<AppShell />", () => {
  beforeEach(() => {
    localStorage.clear();
    assistantStore.setState({
      open: false,
      selectedSessionId: null,
      sessions: {},
      order: [],
      pendingSessionIds: {},
    });
    uiStore.setState({ sidebarTab: "docs" });
  });
  afterEach(() => {
    localStorage.clear();
  });

  test("mounts with brand, search, and new-doc button", () => {
    render(<AppShell />);
    screen.getByText("Patram");
    screen.getByLabelText(/search documents/i);
    screen.getByRole("button", { name: /new document/i });
  });

  test("shows seeded documents in the sidebar", () => {
    render(<AppShell />);
    screen.getByText("Onboarding notes");
    screen.getByText("Product principles");
  });

  test("switching to Sessions tab shows the New chat button", () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    screen.getByRole("button", { name: /new chat/i });
  });

  test("Topbar assistant toggle opens and closes the panel", () => {
    render(<AppShell />);
    expect(assistantStore.getState().open).toBe(false);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(true);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(false);
  });

  test("Ctrl+/ toggles the assistant; Ctrl+\\ does not", () => {
    render(<AppShell />);
    expect(assistantStore.getState().open).toBe(false);
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(assistantStore.getState().open).toBe(true);
    // Ctrl+\\ toggles sidebar, not assistant
    fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
    expect(assistantStore.getState().open).toBe(true);
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(assistantStore.getState().open).toBe(false);
  });
});
