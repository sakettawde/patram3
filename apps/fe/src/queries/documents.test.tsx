import { describe, expect, test, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useDocumentsQuery, useUpdateDoc } from "./documents";

const updateMock = vi.fn(async (_uid: string, id: string, patch: unknown) => ({
  id,
  userId: "u1",
  title: "x",
  emoji: "📝",
  tag: null,
  contentJson: JSON.stringify(patch),
  createdAt: 1,
  updatedAt: Date.now(),
}));

vi.mock("#/lib/documents-api", () => ({
  documentsApi: {
    list: vi.fn(async () => [
      {
        id: "d1",
        userId: "u1",
        title: "Hello",
        emoji: "📝",
        tag: null,
        contentJson: JSON.stringify({ type: "doc", content: [] }),
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
    update: (uid: string, id: string, patch: unknown) => updateMock(uid, id, patch),
  },
}));

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useDocumentsQuery", () => {
  test("returns the documents list for the current user", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDocumentsQuery("u1"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].title).toBe("Hello");
  });

  test("disabled when userId is null", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDocumentsQuery(null), { wrapper: wrap(qc) });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useUpdateDoc debouncing", () => {
  test("rapid schedule() calls collapse into a single PATCH after the debounce window", async () => {
    vi.useFakeTimers();
    updateMock.mockClear();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUpdateDoc("u1", "d1"), { wrapper: wrap(qc) });

    // Simulate 5 rapid keystrokes well within the 2 s debounce window.
    act(() => {
      result.current.schedule({
        contentJson: { type: "doc", content: [{ type: "text", text: "a" }] },
      });
    });
    act(() => vi.advanceTimersByTime(500));
    act(() => {
      result.current.schedule({
        contentJson: { type: "doc", content: [{ type: "text", text: "ab" }] },
      });
    });
    act(() => vi.advanceTimersByTime(500));
    act(() => {
      result.current.schedule({
        contentJson: { type: "doc", content: [{ type: "text", text: "abc" }] },
      });
    });

    // Total elapsed: 1 s. Still within debounce window — no PATCH yet.
    expect(updateMock).not.toHaveBeenCalled();

    // Cross the 2 s threshold from the LAST keystroke.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, , patch] = updateMock.mock.calls[0];
    expect(
      (patch as { contentJson: { content: Array<{ text: string }> } }).contentJson.content[0].text,
    ).toBe("abc");

    vi.useRealTimers();
  });

  test("returned object identity is stable across renders (consumers can use it as an effect dep)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useUpdateDoc("u1", "d1"), { wrapper: wrap(qc) });
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });
});
