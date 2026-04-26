import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { assistantStore } from "#/stores/assistant";
import { documentsStore } from "#/stores/documents";
import { SidebarHeaderActions } from "./sidebar-header-actions";

vi.mock("#/auth/auth-gate", async () => {
  const actual = await vi.importActual<typeof import("#/auth/auth-gate")>("#/auth/auth-gate");
  return { ...actual, useUser: () => ({ id: "u1", name: "Test", createdAt: 0 }) };
});

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("#/lib/documents-api", () => ({
  documentsApi: {
    list: vi.fn(async () => []),
    create: vi.fn(async (uid: string) => ({
      id: "new-doc",
      userId: uid,
      title: "",
      emoji: null,
      tag: null,
      contentJson: JSON.stringify({ type: "doc", content: [] }),
      createdAt: 1,
      updatedAt: 1,
    })),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<SidebarHeaderActions />, { wrapper: Wrapper });
}

describe("<SidebarHeaderActions />", () => {
  beforeEach(() => {
    localStorage.clear();
    navigateMock.mockReset();
    assistantStore.setState({
      open: false,
      selectedSessionId: null,
      sessions: {},
      order: [],
      pendingSessionIds: {},
    });
    documentsStore.setState({ selectedId: null });
  });
  afterEach(() => localStorage.clear());

  test("renders both buttons with the expected accessible labels", () => {
    renderIt();
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New document" })).toBeTruthy();
  });

  test("clicking 'New chat' creates a doc, opens the assistant, and navigates home", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(documentsStore.getState().selectedId).toBe("new-doc");
    expect(assistantStore.getState().open).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
  });

  test("clicking 'New document' creates a doc, navigates home, but does NOT open the assistant", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole("button", { name: "New document" }));
    expect(documentsStore.getState().selectedId).toBe("new-doc");
    expect(assistantStore.getState().open).toBe(false);
    expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
  });
});
