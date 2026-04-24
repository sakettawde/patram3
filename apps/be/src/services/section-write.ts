import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import { documents, sections, sectionLinks } from "../db/schema";
import { canonicalizeJson } from "../lib/content/canonicalize";
import { extractLinks, type LinkTuple } from "../lib/content/extract-links";
import { extractText } from "../lib/content/extract-text";
import { sha256Hex } from "../lib/content/hash";

// TxOrDb accepts both the top-level Db and any nested PgTransaction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxOrDb = PgDatabase<any, any, any>;

export class VersionConflictError extends Error {
  currentVersion: number;
  constructor(currentVersion: number) {
    super("Version conflict");
    this.name = "VersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export type SectionKind = "prose" | "list" | "table" | "code" | "callout" | "embed";

export type CreateSectionInput = {
  documentId: string;
  userId: string;
  orderKey: string;
  contentJson: unknown;
  label?: string | null;
  kind?: SectionKind;
  frontmatter?: Record<string, unknown>;
};

export type UpdateSectionInput = {
  sectionId: string;
  expectedVersion: number;
  userId: string;
  patch: {
    contentJson?: unknown;
    label?: string | null;
    kind?: SectionKind;
    frontmatter?: Record<string, unknown>;
    orderKey?: string;
  };
};

type Derived = {
  canonicalJson: unknown;
  contentText: string;
  contentHash: string;
  links: LinkTuple[];
};

async function derive(contentJson: unknown): Promise<Derived> {
  const canonical = canonicalizeJson(contentJson);
  const contentText = extractText(contentJson);
  const contentHash = await sha256Hex(canonical);
  const links = extractLinks(contentJson);
  return { canonicalJson: JSON.parse(canonical), contentText, contentHash, links };
}

async function filterLinksToWorkspace(
  tx: TxOrDb,
  workspaceId: string,
  links: LinkTuple[],
): Promise<LinkTuple[]> {
  if (links.length === 0) return [];
  const docIds = [...new Set(links.map((l) => l.targetDocumentId))];
  const rows = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(and(inArray(documents.id, docIds), eq(documents.workspaceId, workspaceId)));
  const allowed = new Set(rows.map((r) => r.id));
  return links.filter((l) => allowed.has(l.targetDocumentId));
}

export async function createSection(db: Db, input: CreateSectionInput) {
  const derived = await derive(input.contentJson);

  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select({ workspaceId: documents.workspaceId })
      .from(documents)
      .where(eq(documents.id, input.documentId));
    if (!doc) throw new Error("Document not found");

    const [inserted] = await tx
      .insert(sections)
      .values({
        documentId: input.documentId,
        orderKey: input.orderKey,
        label: input.label ?? null,
        kind: input.kind ?? "prose",
        contentJson: derived.canonicalJson as never,
        contentText: derived.contentText,
        contentHash: derived.contentHash,
        frontmatter: (input.frontmatter ?? {}) as never,
        version: 1,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .returning();
    if (!inserted) throw new Error("Section insert failed");

    const allowed = await filterLinksToWorkspace(tx, doc.workspaceId, derived.links);
    if (allowed.length > 0) {
      await tx.insert(sectionLinks).values(
        allowed.map((l) => ({
          sourceSectionId: inserted.id,
          targetDocumentId: l.targetDocumentId,
          targetSectionId: l.targetSectionId,
        })),
      );
    }

    return inserted;
  });
}

export async function updateSection(db: Db, input: UpdateSectionInput) {
  const contentJson = input.patch.contentJson;
  const derived = contentJson !== undefined ? await derive(contentJson) : null;

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ version: sections.version, documentId: sections.documentId })
      .from(sections)
      .where(eq(sections.id, input.sectionId));
    if (!current) throw new Error("Section not found");
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError(current.version);
    }
    const [doc] = await tx
      .select({ workspaceId: documents.workspaceId })
      .from(documents)
      .where(eq(documents.id, current.documentId));
    if (!doc) throw new Error("Document not found");

    const setPatch: Record<string, unknown> = {
      version: sql`${sections.version} + 1`,
      updatedBy: input.userId,
      updatedAt: sql`now()`,
    };
    if (input.patch.label !== undefined) setPatch.label = input.patch.label;
    if (input.patch.kind !== undefined) setPatch.kind = input.patch.kind;
    if (input.patch.frontmatter !== undefined) setPatch.frontmatter = input.patch.frontmatter;
    if (input.patch.orderKey !== undefined) setPatch.orderKey = input.patch.orderKey;
    if (derived) {
      setPatch.contentJson = derived.canonicalJson;
      setPatch.contentText = derived.contentText;
      setPatch.contentHash = derived.contentHash;
    }

    const [updated] = await tx
      .update(sections)
      .set(setPatch)
      .where(and(eq(sections.id, input.sectionId), eq(sections.version, input.expectedVersion)))
      .returning();
    if (!updated) throw new VersionConflictError(current.version);

    if (derived) {
      await tx.delete(sectionLinks).where(eq(sectionLinks.sourceSectionId, input.sectionId));
      const allowed = await filterLinksToWorkspace(tx, doc.workspaceId, derived.links);
      if (allowed.length > 0) {
        await tx.insert(sectionLinks).values(
          allowed.map((l) => ({
            sourceSectionId: input.sectionId,
            targetDocumentId: l.targetDocumentId,
            targetSectionId: l.targetSectionId,
          })),
        );
      }
    }

    return updated;
  });
}
