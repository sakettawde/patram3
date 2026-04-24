import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { sectionsRouter } from "./sections";
import { documents, workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
let docId: string;
const USER = "user-a";

describe("sections routes", () => {
  beforeAll(async () => {
    db = await getTestDb();
  });
  beforeEach(async () => {
    await truncateAll(db);
    const [ws] = await db
      .insert(workspaces)
      .values({ name: "T", slug: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
      .returning();
    wsId = ws!.id;
    await db.insert(workspaceMembers).values({ workspaceId: wsId, userId: USER, role: "owner" });
    const [doc] = await db
      .insert(documents)
      .values({ workspaceId: wsId, createdBy: USER, updatedBy: USER, title: "D" })
      .returning();
    docId = doc!.id;
    app = new Hono<AuthEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: USER, workspaceId: wsId, role: "owner" });
      await next();
    });
    app.route("/", sectionsRouter);
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("POST creates a section with version=1", async () => {
    const res = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
        },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { version: number; contentText: string };
    expect(body.version).toBe(1);
    expect(body.contentText).toBe("x");
  });

  it("PATCH with correct expectedVersion returns updated section with version=2", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string; version: number };
    const res = await app.request(`/sections/${section.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: section.version,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "updated" }] }],
        },
      }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { version: number; contentText: string };
    expect(updated.version).toBe(2);
    expect(updated.contentText).toBe("updated");
  });

  it("PATCH with stale expectedVersion returns 409 with currentVersion", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string };
    const res = await app.request(`/sections/${section.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 999, label: "x" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; currentVersion: number };
    expect(body.error).toBe("version_conflict");
    expect(body.currentVersion).toBe(1);
  });

  it("PATCH to foreign workspace section returns 404", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string; version: number };

    const [ws2] = await db
      .insert(workspaces)
      .values({ name: "O", slug: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
      .returning();
    const other = new Hono<AuthEnv>();
    other.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: "u2", workspaceId: ws2!.id, role: "owner" });
      await next();
    });
    other.route("/", sectionsRouter);
    const res = await other.request(`/sections/${section.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: section.version, label: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE removes the section", async () => {
    const created = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const section = (await created.json()) as { id: string };
    const res = await app.request(`/sections/${section.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});
