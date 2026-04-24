import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { z } from "zod";
import { documents, sections } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection } from "../services/section-write";
import type { AuthEnv } from "../middleware/auth";
import { requireWrite } from "../middleware/auth";

const listQuery = z.object({
  status: z.enum(["draft", "review", "published", "archived"]).optional(),
  parentId: z.union([z.string().uuid(), z.literal("null")]).optional(),
});

const createBody = z.object({
  title: z.string().optional(),
  emoji: z.string().optional(),
  docType: z.enum(["prd", "strategy", "spec", "rfc", "other"]).optional(),
  status: z.enum(["draft", "review", "published", "archived"]).optional(),
  parentDocumentId: z.string().uuid().nullable().optional(),
});

const patchBody = z.object({
  expectedUpdatedAt: z.string().datetime(),
  title: z.string().optional(),
  emoji: z.string().nullable().optional(),
  docType: z.enum(["prd", "strategy", "spec", "rfc", "other"]).optional(),
  status: z.enum(["draft", "review", "published", "archived"]).optional(),
  parentDocumentId: z.string().uuid().nullable().optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
});

export const documentsRouter = new Hono<AuthEnv>()
  .get("/", zValidator("query", listQuery), async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const q = c.req.valid("query");
    const conds = [eq(documents.workspaceId, workspaceId)];
    if (q.status) conds.push(eq(documents.status, q.status));
    if (q.parentId === "null") conds.push(isNull(documents.parentDocumentId));
    else if (q.parentId) conds.push(eq(documents.parentDocumentId, q.parentId));
    const rows = await db
      .select()
      .from(documents)
      .where(and(...conds))
      .orderBy(desc(documents.updatedAt));
    return c.json(rows);
  })
  .post("/", requireWrite(), zValidator("json", createBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const body = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          workspaceId,
          title: body.title ?? "Untitled",
          emoji: body.emoji,
          docType: body.docType ?? "other",
          status: body.status ?? "draft",
          parentDocumentId: body.parentDocumentId ?? null,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();
      if (!doc) throw new Error("insert failed");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const section = await createSection(tx as unknown as PgDatabase<any, any, any> as any, {
        documentId: doc.id,
        userId,
        orderKey: keyAfter(null),
        contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      });
      return { doc, section };
    });
    return c.json({ document: result.doc, sections: [result.section] }, 201);
  })
  .get("/:id", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)));
    if (!doc) return c.json({ error: "not_found" }, 404);
    const secs = await db
      .select()
      .from(sections)
      .where(eq(sections.documentId, id))
      .orderBy(asc(sections.orderKey));
    return c.json({ document: doc, sections: secs });
  })
  .patch("/:id", requireWrite(), zValidator("json", patchBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [existing] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)));
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (existing.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      return c.json({ error: "conflict", currentUpdatedAt: existing.updatedAt.toISOString() }, 409);
    }
    const setPatch: Record<string, unknown> = { updatedBy: userId };
    if (body.title !== undefined) setPatch.title = body.title;
    if (body.emoji !== undefined) setPatch.emoji = body.emoji;
    if (body.docType !== undefined) setPatch.docType = body.docType;
    if (body.status !== undefined) setPatch.status = body.status;
    if (body.parentDocumentId !== undefined) setPatch.parentDocumentId = body.parentDocumentId;
    if (body.frontmatter !== undefined) setPatch.frontmatter = body.frontmatter;
    const [updated] = await db
      .update(documents)
      .set(setPatch)
      .where(eq(documents.id, id))
      .returning();
    return c.json(updated);
  })
  .delete("/:id", requireWrite(), async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const result = await db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)))
      .returning({ id: documents.id });
    if (result.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });
