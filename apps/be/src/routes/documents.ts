import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { documents } from "../db/schema";
import { withAuth } from "../middleware/auth";
import { buildSeedDocs } from "../lib/seed-docs";
import { ensureBlockIds } from "../lib/document-markdown";

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

function defaultDocContent(): string {
  // Stamp the heading with an id at create-time so the FE's UniqueID extension
  // and the BE's agent-context serializer agree on the id from the very first
  // turn, before any FE autosave has had a chance to write back.
  const doc = {
    type: "doc",
    content: [{ type: "heading", attrs: { level: 1, id: nanoid(8) } }],
  };
  return JSON.stringify(doc);
}

app.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    title: string;
    emoji: string;
    tag: string | null;
    contentJson: unknown;
  }>;

  const userId = c.get("userId");
  const now = Date.now();

  // If the caller passed contentJson, ensure every top-level block carries an id
  // before we persist — same contract as the FE's UniqueID extension.
  let contentJson: string;
  if (body.contentJson === undefined) {
    contentJson = defaultDocContent();
  } else {
    const parsed = body.contentJson as Parameters<typeof ensureBlockIds>[0];
    ensureBlockIds(parsed);
    contentJson = JSON.stringify(parsed);
  }

  const row = {
    id: nanoid(8),
    userId,
    title: typeof body.title === "string" && body.title.trim() ? body.title : "Untitled",
    emoji: typeof body.emoji === "string" && body.emoji ? body.emoji : "📝",
    tag: body.tag === null || body.tag === undefined ? null : String(body.tag),
    contentJson,
    createdAt: now,
    updatedAt: now,
  };

  await getDb(c.env.DB).insert(documents).values(row);
  return c.json(row, 201);
});

app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const db = getDb(c.env.DB);

  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    title: string;
    emoji: string;
    tag: string | null;
    contentJson: unknown;
  }>;

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof body.title === "string") patch.title = body.title.trim() || "Untitled";
  if (typeof body.emoji === "string" && body.emoji) patch.emoji = body.emoji;
  if (body.tag === null) patch.tag = null;
  else if (typeof body.tag === "string") patch.tag = body.tag;
  if (body.contentJson !== undefined) patch.contentJson = JSON.stringify(body.contentJson);

  const result = await db
    .update(documents)
    .set(patch)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .returning();

  if (result.length === 0) return c.json({ error: "not_found" }, 404);
  return c.json(result[0]);
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const db = getDb(c.env.DB);

  const result = await db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .returning({ id: documents.id });

  if (result.length === 0) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});

export default app;
