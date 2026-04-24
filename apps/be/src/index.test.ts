import { afterAll, describe, expect, it } from "vite-plus/test";
import app from "./index";
import { closeTestDb } from "./test/harness";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): Record<string, string> {
  const path = resolve(process.cwd(), ".dev.vars");
  try {
    const text = readFileSync(path, "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx), l.slice(idx + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), DEV_SEED: "0" };

describe("app", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("GET /documents without session returns 401", async () => {
    const res = await app.request("/documents", { headers: {} }, env);
    expect(res.status).toBe(401);
  });
});
