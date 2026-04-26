import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { AuthGate } from "#/auth/auth-gate";
import { AppShell } from "#/components/app-shell";
import { DocSurface } from "#/components/doc/doc-surface";
import { assistantStore } from "#/stores/assistant";
import { documentsStore } from "#/stores/documents";
import { uiStore } from "#/stores/ui";

vi.mock("@tanstack/react-devtools", () => ({ TanStackDevtools: () => null }));
vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtoolsPanel: () => null,
}));

vi.mock("#/auth/auth-gate", () => ({
  // Bypass the name-prompt flow; the router mounts <AuthGate>{children}</AuthGate>
  // around the Outlet, and downstream components only need useUser() to resolve.
  AuthGate: ({ children }: { children: import("react").ReactNode }) => <>{children}</>,
  useUser: () => ({ id: "u1", name: "Test", createdAt: 0 }),
}));

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

// Build a route tree that mirrors the production layout (`__root` → `_app` →
// index) but skips the `shellComponent` from `__root.tsx`, which renders an
// `<html>` shell that React can't mount inside a jsdom test container. The
// shape — AuthGate around the Outlet, AppShell as the layout, DocSurface as
// the index — matches the real tree, so AppShell sees the same context it
// does in the browser.
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
});
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: DocSurface,
});
const testRouteTree = rootRoute.addChildren([appRoute.addChildren([appIndexRoute])]);

async function renderShell(initialPath: string = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: testRouteTree,
    context: { queryClient: qc },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    // Devtools cause noise in jsdom; disable for tests.
    defaultPreload: false,
  });
  // Resolve the initial match so RouterProvider commits the AppShell tree
  // synchronously on first render — matches what users see in the browser.
  await router.load();
  const result = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => screen.getByText("Patram"));
  return result;
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

  test("mounts with brand, search, and new-doc button", async () => {
    await renderShell();
    screen.getByLabelText(/search documents/i);
    screen.getByRole("button", { name: /new document/i });
  });

  test("shows documents from the server in the sidebar", async () => {
    await renderShell();
    // Both titles render in the sidebar; the auto-selected last doc also
    // renders in the topbar h1, so "Product principles" appears twice.
    await waitFor(() => {
      screen.getByText("Onboarding notes");
      expect(screen.getAllByText("Product principles").length).toBeGreaterThanOrEqual(1);
    });
  });

  test("switching to Sessions tab shows the New chat button", async () => {
    await renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    screen.getByRole("button", { name: /new chat/i });
  });

  test("Topbar assistant toggle opens and closes the panel", async () => {
    await renderShell();
    expect(assistantStore.getState().open).toBe(false);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(true);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(false);
  });

  test("Ctrl+/ toggles the assistant; Ctrl+\\ does not", async () => {
    await renderShell();
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
