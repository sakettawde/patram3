import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { users } from "../db/schema";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

app.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0 || name.length > 80) {
    return c.json({ error: "invalid_name" }, 400);
  }

  const now = Date.now();
  const row = { id: nanoid(), name, createdAt: now, updatedAt: now };
  await getDb(c.env.DB).insert(users).values(row);
  return c.json(row, 201);
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await getDb(c.env.DB).select().from(users).where(eq(users.id, id)).limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

export default app;
