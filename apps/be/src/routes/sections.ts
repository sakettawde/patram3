import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { z } from "zod";
import { documents, sections, sectionVersions } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection, updateSection, VersionConflictError } from "../services/section-write";
import { ensureDocumentInWorkspace } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";
import { requireWrite } from "../middleware/auth";

const createBody = z.object({
  orderKey: z.string().optional(),
  kind: z.enum(["prose", "list", "table", "code", "callout", "embed"]).optional(),
  contentJson: z.unknown().optional(),
  label: z.string().nullable().optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
});

const patchBody = z.object({
  expectedVersion: z.number().int().positive(),
  contentJson: z.unknown().optional(),
  label: z.string().nullable().optional(),
  kind: z.enum(["prose", "list", "table", "code", "callout", "embed"]).optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  orderKey: z.string().optional(),
});

async function computeNextOrderKey(db: AuthEnv["Variables"]["db"], docId: string): Promise<string> {
  const rows = await db
    .select({ orderKey: sections.orderKey })
    .from(sections)
    .where(eq(sections.documentId, docId));
  const last =
    rows
      .map((r) => r.orderKey)
      .sort()
      .at(-1) ?? null;
  return keyAfter(last);
}

export const sectionsRouter = new Hono<AuthEnv>()
  .post("/documents/:docId/sections", requireWrite(), zValidator("json", createBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const docId = c.req.param("docId");
    if (!(await ensureDocumentInWorkspace(db, docId, workspaceId)))
      return c.json({ error: "not_found" }, 404);
    const body = c.req.valid("json");
    const orderKey = body.orderKey ?? (await computeNextOrderKey(db, docId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const section = await createSection(db as unknown as PgDatabase<any, any, any> as any, {
      documentId: docId,
      userId,
      orderKey,
      contentJson: body.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
      label: body.label ?? null,
      kind: body.kind,
      frontmatter: body.frontmatter,
    });
    return c.json(section, 201);
  })
  .patch("/sections/:id", requireWrite(), zValidator("json", patchBody), async (c) => {
    const db = c.get("db");
    const { userId, workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ documentId: sections.documentId, wsId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.wsId !== workspaceId) return c.json({ error: "not_found" }, 404);
    const body = c.req.valid("json");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await updateSection(db as unknown as PgDatabase<any, any, any> as any, {
        sectionId: id,
        expectedVersion: body.expectedVersion,
        userId,
        patch: {
          contentJson: body.contentJson,
          label: body.label,
          kind: body.kind,
          frontmatter: body.frontmatter,
          orderKey: body.orderKey,
        },
      });
      return c.json(updated);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        const [current] = await db.select().from(sections).where(eq(sections.id, id));
        return c.json(
          {
            error: "version_conflict",
            currentVersion: err.currentVersion,
            currentSection: current,
          },
          409,
        );
      }
      throw err;
    }
  })
  .delete("/sections/:id", requireWrite(), async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ wsId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.wsId !== workspaceId) return c.json({ error: "not_found" }, 404);
    await db.delete(sections).where(eq(sections.id, id));
    return c.json({ ok: true });
  })
  .post(
    "/sections/:id/versions",
    requireWrite(),
    zValidator("json", z.object({ changeSummary: z.string().optional() })),
    async (c) => {
      const db = c.get("db");
      const { userId, workspaceId } = c.get("auth");
      const id = c.req.param("id");
      const [row] = await db
        .select({ section: sections, wsId: documents.workspaceId })
        .from(sections)
        .innerJoin(documents, eq(documents.id, sections.documentId))
        .where(eq(sections.id, id));
      if (!row || row.wsId !== workspaceId) return c.json({ error: "not_found" }, 404);
      const s = row.section;
      const { changeSummary } = c.req.valid("json");
      const inserted = await db.transaction(async (tx) => {
        const rows = (await tx.execute(
          sql`select coalesce(max(version_number), 0) as max from section_versions where section_id = ${id}`,
        )) as unknown as Array<{ max: number | string }>;
        const nextNumber = Number(rows[0]?.max ?? 0) + 1;
        const [version] = await tx
          .insert(sectionVersions)
          .values({
            sectionId: id,
            versionNumber: nextNumber,
            contentJson: s.contentJson,
            contentText: s.contentText,
            contentHash: s.contentHash,
            label: s.label,
            changeSummary: changeSummary ?? null,
            changedBy: userId,
            changedByType: "user",
          })
          .returning();
        return version;
      });
      return c.json(inserted, 201);
    },
  )
  .get("/sections/:id/versions", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const [row] = await db
      .select({ wsId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.wsId !== workspaceId) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(sectionVersions)
      .where(eq(sectionVersions.sectionId, id))
      .orderBy(desc(sectionVersions.versionNumber));
    return c.json(rows);
  })
  .get("/sections/:id/versions/:n", async (c) => {
    const db = c.get("db");
    const { workspaceId } = c.get("auth");
    const id = c.req.param("id");
    const n = Number(c.req.param("n"));
    if (!Number.isInteger(n) || n <= 0) return c.json({ error: "bad_request" }, 400);
    const [row] = await db
      .select({ wsId: documents.workspaceId })
      .from(sections)
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(sections.id, id));
    if (!row || row.wsId !== workspaceId) return c.json({ error: "not_found" }, 404);
    const [v] = await db
      .select()
      .from(sectionVersions)
      .where(and(eq(sectionVersions.sectionId, id), eq(sectionVersions.versionNumber, n)));
    if (!v) return c.json({ error: "not_found" }, 404);
    return c.json(v);
  });
