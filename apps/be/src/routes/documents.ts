import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
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

const DEFAULT_CONTENT = JSON.stringify({
  type: "doc",
  content: [{ type: "heading", attrs: { level: 1 } }],
});

app.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    title: string;
    emoji: string;
    tag: string | null;
    contentJson: unknown;
  }>;

  const userId = c.get("userId");
  const now = Date.now();
  const row = {
    id: nanoid(8),
    userId,
    title: typeof body.title === "string" && body.title.trim() ? body.title : "Untitled",
    emoji: typeof body.emoji === "string" && body.emoji ? body.emoji : "📝",
    tag: body.tag === null || body.tag === undefined ? null : String(body.tag),
    contentJson:
      body.contentJson === undefined ? DEFAULT_CONTENT : JSON.stringify(body.contentJson),
    createdAt: now,
    updatedAt: now,
  };

  await getDb(c.env.DB).insert(documents).values(row);
  return c.json(row, 201);
});

export default app;
