import { describe, expect, test } from "vitest";
import { ApiError, unwrap } from "./api-error";

describe("ApiError", () => {
  test("is409 returns true for version_conflict body", () => {
    const err = new ApiError(409, { error: "version_conflict", currentVersion: 3 });
    expect(err.is409VersionConflict()).toBe(true);
  });

  test("is409 returns false for other 409 shapes", () => {
    const err = new ApiError(409, { error: "conflict", currentUpdatedAt: "x" });
    expect(err.is409VersionConflict()).toBe(false);
  });

  test("unwrap returns json on 2xx", async () => {
    const res = new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    expect(await unwrap<{ ok: number }>(res)).toEqual({ ok: 1 });
  });

  test("unwrap throws ApiError on non-2xx with parsed body", async () => {
    const res = new Response(JSON.stringify({ error: "bad" }), { status: 400 });
    await expect(unwrap(res)).rejects.toMatchObject({ status: 400, body: { error: "bad" } });
  });

  test("unwrap throws ApiError on non-2xx with no body", async () => {
    const res = new Response("", { status: 500 });
    const err = await unwrap(res).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).body).toBeNull();
  });
});
