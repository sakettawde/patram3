import { describe, expect, it } from "vite-plus/test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("returns typed env when all required vars are present", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@host:5432/db",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://localhost:8787",
      DEV_SEED: "1",
    });
    expect(env.DATABASE_URL).toBe("postgres://u:p@host:5432/db");
    expect(env.DEV_SEED).toBe(true);
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() =>
      parseEnv({
        BETTER_AUTH_SECRET: "x".repeat(32),
        BETTER_AUTH_URL: "http://x",
      } as unknown as Record<string, string>),
    ).toThrow();
  });

  it("defaults DEV_SEED to false when absent", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@host:5432/db",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://x",
    });
    expect(env.DEV_SEED).toBe(false);
  });
});
