import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { assistantStore } from "#/stores/assistant";
import { documentsStore } from "#/stores/documents";
import { uiStore } from "#/stores/ui";
import { AppShell } from "./app-shell";

vi.mock("#/auth/auth-gate", async () => {
  const actual = await vi.importActual<typeof import("#/auth/auth-gate")>("#/auth/auth-gate");
  return {
    ...actual,
    useUser: () => ({ id: "u1", name: "Test", createdAt: 0 }),
  };
});

vi.mock("#/lib/documents-api", () => {
  const rows = [
    {
      id: "d1",
      userId: "u1",
      title: "Onboarding notes",
      emoji: "📝",
      tag: null,
      contentJson: JSON.stringify({ type: "doc", content: [] }),
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "d2",
      userId: "u1",
      title: "Product principles",
      emoji: "📐",
      tag: null,
      contentJson: JSON.stringify({ type: "doc", content: [] }),
      createdAt: 2,
      updatedAt: 2,
    },
  ];
  return {
    documentsApi: {
      list: vi.fn(async () => rows),
      create: vi.fn(),
      // Return the existing row with a bumped updatedAt so the cache update in
      // useUpdateDoc.send() finds a valid `row.id` even if the editor fires an
      // onUpdate during mount.
      update: vi.fn(async (_uid: string, id: string) => ({
        ...(rows.find((r) => r.id === id) ?? rows[0]),
        updatedAt: Date.now(),
      })),
      remove: vi.fn(),
    },
  };
});

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = wrap(qc);
  return render(
    <Wrapper>
      <AppShell />
    </Wrapper>,
  );
}

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
    documentsStore.setState({ selectedId: null });
  });
  afterEach(() => {
    localStorage.clear();
  });

  test("mounts with brand, search, and new-doc button", () => {
    renderShell();
    screen.getByText("Patram");
    screen.getByLabelText(/search documents/i);
    screen.getByRole("button", { name: /new document/i });
  });

  test("shows documents from the server in the sidebar", async () => {
    renderShell();
    // Both titles render in the sidebar; the auto-selected last doc also
    // renders in the topbar h1, so "Product principles" appears twice.
    await waitFor(() => {
      screen.getByText("Onboarding notes");
      expect(screen.getAllByText("Product principles").length).toBeGreaterThanOrEqual(1);
    });
  });

  test("switching to Sessions tab shows the New chat button", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    screen.getByRole("button", { name: /new chat/i });
  });

  test("Topbar assistant toggle opens and closes the panel", () => {
    renderShell();
    expect(assistantStore.getState().open).toBe(false);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(true);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(false);
  });

  test("Ctrl+/ toggles the assistant; Ctrl+\\ does not", () => {
    renderShell();
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
