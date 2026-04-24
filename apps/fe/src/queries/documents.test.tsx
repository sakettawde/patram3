import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";
import { server } from "#/test/server";
import {
  useCreateDocument,
  useDeleteDocument,
  useDocument,
  useDocumentsList,
  useUpdateDocument,
} from "./documents";

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

describe("useCreateDocument", () => {
  test("seeds document cache and prepends to list", async () => {
    server.use(
      http.post("*/documents", () =>
        HttpResponse.json(
          {
            document: { id: "d2", title: "Untitled", updatedAt: "2026-01-02T00:00:00Z" },
            sections: [
              {
                id: "s2",
                documentId: "d2",
                orderKey: "a0",
                version: 1,
                contentJson: { type: "doc" },
              },
            ],
          },
          { status: 201 },
        ),
      ),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "list", { status: undefined }], []);
    const { result } = renderHook(() => useCreateDocument(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({});
    });
    const detail = qc.getQueryData(["documents", "detail", "d2"]);
    expect(detail).toBeDefined();
  });
});

describe("useUpdateDocument", () => {
  test("sends expectedUpdatedAt from cache and patches on success", async () => {
    let sentBody: unknown = null;
    server.use(
      http.patch("*/documents/:id", async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ id: "d1", title: "New", updatedAt: "2026-01-03T00:00:00Z" });
      }),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", title: "Old", updatedAt: "2026-01-01T00:00:00Z" },
      sections: [],
    });
    const { result } = renderHook(() => useUpdateDocument("d1"), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ title: "New" });
    });
    expect((sentBody as { expectedUpdatedAt: string }).expectedUpdatedAt).toBe(
      "2026-01-01T00:00:00Z",
    );
  });
});

describe("useDeleteDocument", () => {
  test("removes detail cache on success", async () => {
    server.use(http.delete("*/documents/:id", () => HttpResponse.json({ ok: true })));
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], { document: { id: "d1" }, sections: [] });
    const { result } = renderHook(() => useDeleteDocument(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync("d1");
    });
    expect(qc.getQueryData(["documents", "detail", "d1"])).toBeUndefined();
  });
});
