import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";
import { documents, sections, sectionLinks, workspaces, workspaceMembers } from "../db/schema";
import { keyAfter } from "../lib/order-key";
import { createSection, updateSection, VersionConflictError } from "./section-write";

let db: TestDb;
const USER = "user-a";
const OTHER_USER = "user-b";
let wsId: string;
let docId: string;

async function seed(): Promise<void> {
  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Test", slug: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
    .returning();
  wsId = ws!.id;
  await db.insert(workspaceMembers).values({ workspaceId: ws!.id, userId: USER, role: "owner" });
  const [doc] = await db
    .insert(documents)
    .values({ workspaceId: ws!.id, createdBy: USER, updatedBy: USER, title: "Doc" })
    .returning();
  docId = doc!.id;
}

describe("section-write service", () => {
  beforeAll(async () => {
    db = await getTestDb();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("createSection sets derived fields and version=1", async () => {
    const section = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
      },
    });
    expect(section.version).toBe(1);
    expect(section.contentText).toBe("hello");
    expect(section.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("updateSection with correct expectedVersion bumps to 2 and updates text+hash", async () => {
    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
      },
    });
    const updated = await updateSection(db, {
      sectionId: created.id,
      expectedVersion: 1,
      userId: USER,
      patch: {
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }],
        },
      },
    });
    expect(updated.version).toBe(2);
    expect(updated.contentText).toBe("b");
    expect(updated.contentHash).not.toBe(created.contentHash);
  });

  it("updateSection throws VersionConflictError when version is stale", async () => {
    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: { type: "doc", content: [] },
    });
    await expect(
      updateSection(db, {
        sectionId: created.id,
        expectedVersion: 999,
        userId: USER,
        patch: { label: "x" },
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("rewrites section_links on each save", async () => {
    const [otherDoc] = await db
      .insert(documents)
      .values({ workspaceId: wsId, createdBy: USER, updatedBy: USER, title: "Other" })
      .returning();

    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "ref",
                marks: [{ type: "docLink", attrs: { docId: otherDoc!.id } }],
              },
            ],
          },
        ],
      },
    });
    const linksAfterCreate = await db
      .select()
      .from(sectionLinks)
      .where(eq(sectionLinks.sourceSectionId, created.id));
    expect(linksAfterCreate).toHaveLength(1);
    expect(linksAfterCreate[0]?.targetDocumentId).toBe(otherDoc!.id);

    await updateSection(db, {
      sectionId: created.id,
      expectedVersion: 1,
      userId: USER,
      patch: { contentJson: { type: "doc", content: [] } },
    });
    const linksAfterUpdate = await db
      .select()
      .from(sectionLinks)
      .where(eq(sectionLinks.sourceSectionId, created.id));
    expect(linksAfterUpdate).toHaveLength(0);
  });

  it("partial update without contentJson preserves existing section_links", async () => {
    const [otherDoc] = await db
      .insert(documents)
      .values({ workspaceId: wsId, createdBy: USER, updatedBy: USER, title: "Other" })
      .returning();

    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "ref",
                marks: [{ type: "docLink", attrs: { docId: otherDoc!.id } }],
              },
            ],
          },
        ],
      },
    });

    await updateSection(db, {
      sectionId: created.id,
      expectedVersion: 1,
      userId: USER,
      patch: { label: "renamed" },
    });

    const links = await db
      .select()
      .from(sectionLinks)
      .where(eq(sectionLinks.sourceSectionId, created.id));
    expect(links).toHaveLength(1);
    expect(links[0]?.targetDocumentId).toBe(otherDoc!.id);
  });

  it("drops cross-workspace link targets silently", async () => {
    const [ws2] = await db
      .insert(workspaces)
      .values({
        name: "Other WS",
        slug: `x-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      })
      .returning();
    await db.insert(workspaceMembers).values({
      workspaceId: ws2!.id,
      userId: OTHER_USER,
      role: "owner",
    });
    const [foreignDoc] = await db
      .insert(documents)
      .values({
        workspaceId: ws2!.id,
        createdBy: OTHER_USER,
        updatedBy: OTHER_USER,
        title: "Foreign",
      })
      .returning();

    const created = await createSection(db, {
      documentId: docId,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "docLink", attrs: { docId: foreignDoc!.id } }],
              },
            ],
          },
        ],
      },
    });
    const links = await db
      .select()
      .from(sectionLinks)
      .where(eq(sectionLinks.sourceSectionId, created.id));
    expect(links).toHaveLength(0);
    const refetched = await db.select().from(sections).where(eq(sections.id, created.id));
    expect(refetched).toHaveLength(1);
  });
});
