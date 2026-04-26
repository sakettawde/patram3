import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";

type Env = { Bindings: CloudflareBindings; Variables: { userId: string } };

export function withAuth() {
  return createMiddleware<Env>(async (c, next) => {
    const id = c.req.header("X-User-Id");
    if (!id) return c.json({ error: "unauthorized" }, 401);
    const [row] = await getDb(c.env.DB)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", row.id);
    await next();
  });
}
