import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { documents } from "../db/schema";
import { withAuth } from "../middleware/auth";
import { buildSeedDocs } from "../lib/seed-docs";

type Env = { Bindings: CloudflareBindings; Variables: { userId: string } };

const app = new Hono<Env>();

app.use("*", withAuth());

app.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(asc(documents.createdAt));

  if (rows.length === 0) {
    const seed = buildSeedDocs(userId, Date.now());
    await db.insert(documents).values(seed);
    return c.json(seed);
  }
  return c.json(rows);
});

export default app;
