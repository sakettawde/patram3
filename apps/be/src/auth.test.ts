import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { workspaceMembers, workspaces } from "./db/schema";
import { createAuth } from "./auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "./test/harness";

let db: TestDb;
let auth: ReturnType<typeof createAuth>;

async function truncateAuthTables(): Promise<void> {
  await db.execute(sql`
    truncate table "verification", "account", "session", "user" restart identity cascade
  `);
}

describe("BetterAuth post-signup hook", () => {
  beforeAll(async () => {
    db = await getTestDb();
    auth = createAuth(db, {
      secret: "x".repeat(64),
      baseURL: "http://localhost:8787",
    });
  });
  beforeEach(async () => {
    // Clear auth tables AND app tables so repeat runs are clean
    await truncateAuthTables();
    await truncateAll(db);
  });
  afterAll(async () => {
    await truncateAuthTables();
    await closeTestDb();
  });

  it("creates a workspace and owner membership on first signup", async () => {
    const email = `ada-${Date.now()}@example.test`;
    await auth.api.signUpEmail({
      body: { email, password: "pw-long-enough-123", name: "Ada" },
    });

    const allWs = await db.select().from(workspaces);
    expect(allWs).toHaveLength(1);
    const members = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, allWs[0]!.id));
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");
  });
});
