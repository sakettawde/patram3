import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { documents } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection } from "../services/section-write";
import type { AuthEnv } from "../middleware/auth";

export const devRouter = new Hono<AuthEnv>().post("/seed", async (c) => {
  const db = c.get("db");
  const { userId, workspaceId } = c.get("auth");
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .limit(1);
  if (existing.length > 0) return c.json({ ok: true, skipped: true });
  await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        workspaceId,
        createdBy: userId,
        updatedBy: userId,
        title: "Onboarding notes",
        emoji: "🌿",
      })
      .returning();
    if (!doc) throw new Error("seed doc insert failed");
    let prev: string | null = null;
    const seeds: Array<{ kind: "prose"; text: string }> = [
      { kind: "prose", text: "Welcome to Patram — sections now live on their own." },
      {
        kind: "prose",
        text: "Every section has a version, an optional label, and its own content.",
      },
    ];
    for (const { kind, text } of seeds) {
      prev = keyAfter(prev);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createSection(tx as unknown as PgDatabase<any, any, any> as any, {
        documentId: doc.id,
        userId,
        orderKey: prev,
        kind,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        },
      });
    }
  });
  return c.json({ ok: true, skipped: false });
});
