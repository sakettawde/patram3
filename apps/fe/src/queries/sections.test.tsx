import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";
import { server } from "#/test/server";
import { useCreateSection, useDeleteSection, useUpdateSection } from "./sections";

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

const baseSection = (patch: Partial<Record<string, unknown>> = {}) => ({
  id: "s1",
  documentId: "d1",
  orderKey: "a0",
  label: null,
  kind: "prose",
  contentJson: { type: "doc", content: [{ type: "paragraph" }] },
  contentText: "",
  contentHash: "",
  frontmatter: {},
  version: 1,
  createdBy: "u",
  updatedBy: "u",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...patch,
});

describe("useUpdateSection", () => {
  test("patches section in place on success", async () => {
    server.use(
      http.patch("*/sections/:id", () =>
        HttpResponse.json(baseSection({ version: 2, updatedAt: "2026-01-02T00:00:00Z" })),
      ),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "2026-01-01T00:00:00Z" },
      sections: [baseSection()],
    });
    const { result } = renderHook(() => useUpdateSection({ sectionId: "s1", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ contentJson: { type: "doc" } });
    });
    const cached = qc.getQueryData<{ sections: Array<{ version: number }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(cached?.sections[0]?.version).toBe(2);
  });

  test("does not include expectedVersion in the request payload by default", async () => {
    let captured: unknown = null;
    server.use(
      http.patch("*/sections/:id", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useUpdateSection({ sectionId: "s1", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ contentJson: { type: "doc" } });
    });
    expect(captured).toEqual({ contentJson: { type: "doc" } });
  });
});

describe("useCreateSection", () => {
  test("inserts an optimistic row with the client id and swaps with server result on success", async () => {
    server.use(
      http.post("*/documents/:docId/sections", async ({ request }) => {
        await new Promise((r) => setTimeout(r, 200));
        const body = (await request.json()) as { id: string; orderKey: string };
        return HttpResponse.json(
          baseSection({
            id: body.id,
            orderKey: body.orderKey,
            contentHash: "server-hash",
            contentText: "",
            version: 1,
          }),
          { status: 201 },
        );
      }),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["me"], {
      user: { id: "u1", email: "x", name: "x" },
      workspace: { id: "w1", name: "", slug: "", createdAt: "", updatedAt: "" },
      role: "owner",
    });
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection()],
    });
    const { result } = renderHook(() => useCreateSection("d1"), { wrapper: Wrapper });

    const clientId = "11111111-1111-4111-8111-111111111111";
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.mutateAsync({ id: clientId, orderKey: "a1" });
    });
    // Optimistic — wait for the onMutate microtask to land.
    await waitFor(() => {
      const mid = qc.getQueryData<{
        sections: Array<{ id: string; contentHash: string }>;
      }>(["documents", "detail", "d1"]);
      expect(mid?.sections.map((s) => s.id)).toEqual(["s1", clientId]);
      expect(mid?.sections[1]?.contentHash).toBe("");
    });

    await act(async () => {
      await promise;
    });
    const after = qc.getQueryData<{
      sections: Array<{ id: string; contentHash: string }>;
    }>(["documents", "detail", "d1"]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1", clientId]);
    expect(after?.sections[1]?.contentHash).toBe("server-hash");
  });

  test("rolls back the optimistic insert when the server errors", async () => {
    server.use(
      http.post("*/documents/:docId/sections", () => HttpResponse.json({}, { status: 500 })),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection()],
    });
    const { result } = renderHook(() => useCreateSection("d1"), { wrapper: Wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ id: "22222222-2222-4222-8222-222222222222", orderKey: "a1" })
        .catch(() => {});
    });
    const after = qc.getQueryData<{ sections: Array<{ id: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("useDeleteSection", () => {
  test("removes the section synchronously (optimistic) and keeps it removed on success", async () => {
    server.use(
      http.delete("*/sections/:id", async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json({ ok: true });
      }),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection(), baseSection({ id: "s2" })],
    });
    const { result } = renderHook(() => useDeleteSection({ sectionId: "s2", documentId: "d1" }), {
      wrapper: Wrapper,
    });

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.mutateAsync();
    });
    // Optimistic: onMutate runs on a microtask, so wait for the cache to reflect
    // the removal — this still resolves well before the 30ms MSW delay completes.
    await waitFor(() => {
      const mid = qc.getQueryData<{ sections: Array<{ id: string }> }>([
        "documents",
        "detail",
        "d1",
      ]);
      expect(mid?.sections.map((s) => s.id)).toEqual(["s1"]);
    });

    await act(async () => {
      await promise;
    });
    const after = qc.getQueryData<{ sections: Array<{ id: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1"]);
  });

  test("restores the section when the server errors", async () => {
    server.use(http.delete("*/sections/:id", () => HttpResponse.json({}, { status: 500 })));
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection(), baseSection({ id: "s2" })],
    });
    const { result } = renderHook(() => useDeleteSection({ sectionId: "s2", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });
    const after = qc.getQueryData<{ sections: Array<{ id: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});
