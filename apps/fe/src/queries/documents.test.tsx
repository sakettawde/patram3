import { describe, expect, test, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useDocumentsQuery } from "./documents";

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
