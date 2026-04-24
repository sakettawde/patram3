import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { useSectionSave } from "./use-section-save";
import { putLocalSnapshot, clearLocalSnapshot } from "./section-save-store";
import type { Section } from "#/lib/api-types";
import { server } from "#/test/server";

const serverDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "server" }] }],
};
const localDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "local" }] }],
};

const baseSection = (patch: Partial<Section> = {}): Section =>
  ({
    id: "s1",
    documentId: "d1",
    orderKey: "a0",
    label: null,
    kind: "prose",
    contentJson: serverDoc,
    contentText: "server",
    contentHash: "",
    frontmatter: {},
    version: 1,
    createdBy: "u",
    updatedBy: "u",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...patch,
  }) as Section;

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe("useSectionSave — initialContent", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    clearLocalSnapshot("s1");
  });

  test("uses server content when no local snapshot exists", () => {
    const Wrapper = wrap();
    const { result } = renderHook(
      () =>
        useSectionSave({
          section: baseSection(),
          documentId: "d1",
          editor: null as unknown as TEditor | null,
        }),
      { wrapper: Wrapper },
    );
    expect(result.current.initialContent).toEqual(serverDoc);
  });

  test("uses local snapshot when savedAt > server updatedAt", () => {
    putLocalSnapshot("s1", { contentJson: localDoc, savedAt: Date.UTC(2026, 0, 2) });
    const Wrapper = wrap();
    const { result } = renderHook(
      () =>
        useSectionSave({
          section: baseSection({ updatedAt: "2026-01-01T00:00:00Z" }),
          documentId: "d1",
          editor: null as unknown as TEditor | null,
        }),
      { wrapper: Wrapper },
    );
    expect(result.current.initialContent).toEqual(localDoc);
    expect(result.current.state.status).toBe("dirty");
  });

  test("discards stale local snapshot and uses server content", () => {
    putLocalSnapshot("s1", { contentJson: localDoc, savedAt: Date.UTC(2025, 11, 31) });
    const Wrapper = wrap();
    const { result } = renderHook(
      () =>
        useSectionSave({
          section: baseSection({ updatedAt: "2026-01-01T00:00:00Z" }),
          documentId: "d1",
          editor: null as unknown as TEditor | null,
        }),
      { wrapper: Wrapper },
    );
    expect(result.current.initialContent).toEqual(serverDoc);
    expect(window.localStorage.getItem("patram:section:s1")).toBeNull();
  });
});

type StubEditor = {
  getJSON: () => JSONContent;
  on: (name: string, cb: () => void) => void;
  off: (name: string, cb: () => void) => void;
  __fire: (name: string) => void;
};

function makeStubEditor(initial: JSONContent): StubEditor {
  const current: { json: JSONContent } = { json: initial };
  const listeners: Record<string, Set<() => void>> = {};
  return {
    getJSON: () => current.json,
    on: (name, cb) => {
      (listeners[name] ??= new Set()).add(cb);
    },
    off: (name, cb) => {
      listeners[name]?.delete(cb);
    },
    __fire: (name) => {
      listeners[name]?.forEach((cb) => cb());
    },
  };
}

describe("useSectionSave — save triggers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  test("debounces a save 2s after the last edit", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    act(() => {
      ed.__fire("update");
    });
    expect(calls).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(1999);
      await Promise.resolve();
    });
    expect(calls).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(2);
      await vi.runAllTimersAsync();
    });
    expect(calls).toBe(1);
    // Status will have faded back to "idle" after SAVED_FADE_MS; confirm the
    // save completed by the presence of lastSavedAt.
    expect(result.current.state.lastSavedAt).not.toBeNull();
  });

  test("flushNow short-circuits the debounce", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    act(() => {
      ed.__fire("update");
    });
    await act(async () => {
      await result.current.flushNow();
      await vi.runAllTimersAsync();
    });
    expect(calls).toBe(1);
  });

  test("blur triggers an immediate flush", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    act(() => {
      ed.__fire("update");
    });
    await act(async () => {
      ed.__fire("blur");
      await vi.runAllTimersAsync();
    });
    expect(calls).toBe(1);
  });

  test("serializes concurrent saves — one follow-up, not N", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: calls + 1 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    await act(async () => {
      const p1 = result.current.flushNow();
      const p2 = result.current.flushNow();
      const p3 = result.current.flushNow();
      await Promise.all([p1, p2, p3]);
      await vi.runAllTimersAsync();
    });
    // First call: one flight; the other two collapse to a single queued resave.
    expect(calls).toBe(2);
  });

  test("clears localStorage snapshot on successful save", async () => {
    server.use(http.patch("*/sections/:id", () => HttpResponse.json(baseSection({ version: 2 }))));
    putLocalSnapshot("s1", { contentJson: localDoc, savedAt: Date.UTC(2026, 0, 2) });
    const Wrapper = wrap();
    const ed = makeStubEditor(localDoc);
    const { rerender, result } = renderHook(
      ({ editor }) =>
        useSectionSave({
          section: baseSection({ updatedAt: "2026-01-01T00:00:00Z" }),
          documentId: "d1",
          editor,
        }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    await act(async () => {
      await result.current.flushNow();
      await vi.runAllTimersAsync();
    });
    expect(window.localStorage.getItem("patram:section:s1")).toBeNull();
  });

  test("retries on network failure with exponential backoff, surfaces error on 3rd attempt", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    await act(async () => {
      await result.current.flushNow();
    });
    expect(calls).toBe(1);
    expect(result.current.state.status).toBe("dirty"); // below threshold

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(calls).toBe(2);
    expect(result.current.state.status).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(calls).toBe(3);
    expect(result.current.state.status).toBe("error");
  });
});
