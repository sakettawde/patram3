import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";
import { server } from "#/test/server";
import { useDocument, useDocumentsList } from "./documents";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

describe("useDocumentsList", () => {
  test("passes status query param and returns rows", async () => {
    let seenUrl = "";
    server.use(
      http.get("*/documents", ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([
          { id: "d1", title: "T", status: "draft", updatedAt: "2026-01-01T00:00:00Z" },
        ]);
      }),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useDocumentsList({ status: "draft" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenUrl).toContain("status=draft");
    expect(result.current.data?.[0]?.id).toBe("d1");
  });
});

describe("useDocument", () => {
  test("returns { document, sections }", async () => {
    server.use(
      http.get("*/documents/:id", () =>
        HttpResponse.json({
          document: { id: "d1", title: "T", updatedAt: "2026-01-01T00:00:00Z" },
          sections: [
            {
              id: "s1",
              documentId: "d1",
              orderKey: "a0",
              contentJson: { type: "doc" },
              version: 1,
            },
          ],
        }),
      ),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useDocument("d1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.sections[0]?.id).toBe("s1");
  });
});
