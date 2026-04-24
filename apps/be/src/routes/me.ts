import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { workspaces } from "../db/schema";
import { user } from "../db/auth-schema";
import type { AuthEnv } from "../middleware/auth";

export const meRouter = new Hono<AuthEnv>().get("/", async (c) => {
  const { userId, workspaceId, role } = c.get("auth");
  const db = c.get("db");
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const [u] = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  return c.json({ user: u, workspace: ws, role });
});
