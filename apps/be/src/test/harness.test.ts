import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { closeTestDb, getTestDb, truncateAll } from "./harness";

describe("test harness", () => {
  beforeAll(async () => {
    const db = await getTestDb();
    await truncateAll(db);
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("connects and reports postgres version", async () => {
    const db = await getTestDb();
    const rows = await db.execute(sql`select version() as version`);
    expect(String(rows[0]?.version)).toContain("PostgreSQL");
  });

  it("truncateAll leaves workspace table empty", async () => {
    const db = await getTestDb();
    const rows = await db.execute(sql`select count(*)::int as n from workspaces`);
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
