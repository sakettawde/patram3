import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";
import { server } from "#/test/server";
import { useMe } from "./me";

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useMe", () => {
  test("returns data on 200", async () => {
    server.use(
      http.get("*/me", () =>
        HttpResponse.json({
          user: { id: "u1" },
          workspace: { id: "w1", name: "W", slug: "w", createdAt: "", updatedAt: "" },
          role: "owner",
        }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMe(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.user.id).toBe("u1");
  });

  test("surfaces 401 as error", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMe(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
