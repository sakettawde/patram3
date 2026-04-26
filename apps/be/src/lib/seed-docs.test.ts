import { describe, expect, test } from "vite-plus/test";
import { buildSeedDocs } from "./seed-docs";

describe("buildSeedDocs", () => {
  test("returns 4 docs with stable insertion order via createdAt", () => {
    const now = 1_700_000_000_000;
    const rows = buildSeedDocs("user_abc", now);
    expect(rows).toHaveLength(4);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].createdAt).toBeGreaterThan(rows[i - 1].createdAt);
    }
  });

  test("each row carries userId and a stringified ProseMirror doc", () => {
    const rows = buildSeedDocs("user_abc", Date.now());
    for (const r of rows) {
      expect(r.userId).toBe("user_abc");
      const parsed = JSON.parse(r.contentJson);
      expect(parsed.type).toBe("doc");
      expect(Array.isArray(parsed.content)).toBe(true);
    }
  });

  test("titles match the four canonical seed docs", () => {
    const titles = buildSeedDocs("u", 0).map((r) => r.title);
    expect(titles).toEqual([
      "Onboarding notes",
      "Product principles",
      "Retro — April",
      "Q2 planning",
    ]);
  });
});
