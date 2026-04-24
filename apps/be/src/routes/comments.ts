import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { commentThreads, comments, documents, sections } from "../db/schema";
import { requireWrite } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

async function sectionInWorkspace(
  db: AuthEnv["Variables"]["db"],
  sectionId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ wsId: documents.workspaceId })
    .from(sections)
    .innerJoin(documents, eq(documents.id, sections.documentId))
    .where(eq(sections.id, sectionId));
  return !!row && row.wsId === workspaceId;
}

async function threadInWorkspace(
  db: AuthEnv["Variables"]["db"],
  threadId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ wsId: documents.workspaceId })
    .from(commentThreads)
    .innerJoin(sections, eq(sections.id, commentThreads.sectionId))
    .innerJoin(documents, eq(documents.id, sections.documentId))
    .where(eq(commentThreads.id, threadId));
  return !!row && row.wsId === workspaceId;
}

export const commentsRouter = new Hono<AuthEnv>()
  .post(
    "/sections/:id/threads",
    requireWrite(),
    zValidator("json", z.object({ body: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const sectionId = c.req.param("id");
      if (!(await sectionInWorkspace(db, sectionId, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const { body } = c.req.valid("json");
      const result = await db.transaction(async (tx) => {
        const [thread] = await tx
          .insert(commentThreads)
          .values({ sectionId, createdBy: userId })
          .returning();
        if (!thread) throw new Error("thread insert failed");
        const [comment] = await tx
          .insert(comments)
          .values({ threadId: thread.id, authorId: userId, body })
          .returning();
        return { thread, comments: [comment] };
      });
      return c.json(result, 201);
    },
  )
  .get("/sections/:id/threads", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const sectionId = c.req.param("id");
    if (!(await sectionInWorkspace(db, sectionId, workspaceId)))
      return c.json({ error: "not_found" }, 404);
    const rows = await db.execute(sql`
      select t.*,
        (
          select to_jsonb(first_comment) from (
            select * from comments c where c.thread_id = t.id order by c.created_at asc limit 1
          ) first_comment
        ) as "firstComment",
        (select count(*)::int from comments c where c.thread_id = t.id) as "commentCount"
      from comment_threads t
      where t.section_id = ${sectionId}
      order by t.created_at asc
    `);
    return c.json(rows);
  })
  .patch(
    "/threads/:id",
    requireWrite(),
    zValidator("json", z.object({ status: z.enum(["open", "resolved"]) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      if (!(await threadInWorkspace(db, id, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const { status } = c.req.valid("json");
      const [updated] = await db
        .update(commentThreads)
        .set({
          status,
          resolvedAt: status === "resolved" ? sql`now()` : null,
          resolvedBy: status === "resolved" ? userId : null,
        })
        .where(eq(commentThreads.id, id))
        .returning();
      return c.json(updated);
    },
  )
  .get("/threads/:id/comments", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    if (!(await threadInWorkspace(db, id, workspaceId))) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.threadId, id))
      .orderBy(asc(comments.createdAt));
    return c.json(rows);
  })
  .post(
    "/threads/:id/comments",
    requireWrite(),
    zValidator("json", z.object({ body: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      if (!(await threadInWorkspace(db, id, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const { body } = c.req.valid("json");
      const [inserted] = await db
        .insert(comments)
        .values({ threadId: id, authorId: userId, body })
        .returning();
      return c.json(inserted, 201);
    },
  )
  .patch(
    "/comments/:id",
    requireWrite(),
    zValidator("json", z.object({ body: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      const [row] = await db
        .select({ authorId: comments.authorId, threadId: comments.threadId })
        .from(comments)
        .where(eq(comments.id, id));
      if (!row) return c.json({ error: "not_found" }, 404);
      if (row.authorId !== userId) return c.json({ error: "forbidden" }, 403);
      if (!(await threadInWorkspace(db, row.threadId, workspaceId)))
        return c.json({ error: "not_found" }, 404);
      const [updated] = await db
        .update(comments)
        .set({ body: c.req.valid("json").body, editedAt: sql`now()` })
        .where(eq(comments.id, id))
        .returning();
      return c.json(updated);
    },
  )
  .delete("/comments/:id", requireWrite(), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ authorId: comments.authorId, threadId: comments.threadId })
      .from(comments)
      .where(eq(comments.id, id));
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.authorId !== userId) return c.json({ error: "forbidden" }, 403);
    if (!(await threadInWorkspace(db, row.threadId, workspaceId)))
      return c.json({ error: "not_found" }, 404);
    await db.transaction(async (tx) => {
      await tx.delete(comments).where(eq(comments.id, id));
      const rows = (await tx.execute(
        sql`select count(*)::int as count from comments where thread_id = ${row.threadId}`,
      )) as unknown as Array<{ count: number | string }>;
      if (Number(rows[0]?.count ?? 0) === 0) {
        await tx.delete(commentThreads).where(eq(commentThreads.id, row.threadId));
      }
    });
    return c.json({ ok: true });
  });
