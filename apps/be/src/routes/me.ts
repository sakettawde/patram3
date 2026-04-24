import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";

export const meRouter = new Hono<AuthEnv>().get("/", async (c) => {
  const { userId, workspaceId, role } = c.get("auth");
  const db = c.get("db");
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return c.json({ user: { id: userId }, workspace: ws, role });
});
