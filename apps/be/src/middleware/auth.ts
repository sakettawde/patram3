import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, workspaceMembers } from "../db/schema";
import type { AuthInstance } from "../auth";

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "editor" | "viewer";
};

export type AuthEnv = {
  Variables: { auth: AuthContext; db: Db };
  Bindings: Record<string, unknown>;
};

export function requireSession(auth: AuthInstance, db: Db) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id) return c.json({ error: "unauthenticated" }, 401);
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, session.user.id))
      .limit(1);
    if (!membership) return c.json({ error: "no_workspace" }, 401);
    c.set("auth", {
      userId: session.user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
    });
    c.set("db", db);
    await next();
  });
}

export function requireWrite() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const auth = c.get("auth");
    if (auth.role === "viewer") return c.json({ error: "forbidden" }, 403);
    await next();
  });
}

export async function ensureDocumentInWorkspace(
  db: Db,
  documentId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId)))
    .limit(1);
  return !!row;
}
