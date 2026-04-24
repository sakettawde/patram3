import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { documentsRouter } from "./documents";
import { workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
const USER = "user-a";

async function buildApp(): Promise<Hono<AuthEnv>> {
  const a = new Hono<AuthEnv>();
  a.use("*", async (c, next) => {
    c.set("db", db);
    c.set("auth", { userId: USER, workspaceId: wsId, role: "owner" });
    await next();
  });
  a.route("/documents", documentsRouter);
  return a;
}

describe("documents routes", () => {
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
    app = await buildApp();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("POST creates a document with one initial section", async () => {
    const res = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "My doc" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      document: { id: string; title: string };
      sections: unknown[];
    };
    expect(body.document.title).toBe("My doc");
    expect(body.sections).toHaveLength(1);
  });

  it("GET /documents/:id returns doc + sections", async () => {
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string } };
    const res = await app.request(`/documents/${document.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sections: unknown[] };
    expect(body.sections).toHaveLength(1);
  });

  it("GET /documents/:id returns 404 for doc in another workspace", async () => {
    const [ws2] = await db
      .insert(workspaces)
      .values({ name: "Other", slug: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
      .returning();
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string } };
    const otherApp = new Hono<AuthEnv>();
    otherApp.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: "other", workspaceId: ws2!.id, role: "owner" });
      await next();
    });
    otherApp.route("/documents", documentsRouter);
    const res = await otherApp.request(`/documents/${document.id}`);
    expect(res.status).toBe(404);
  });

  it("PATCH returns 409 on stale expectedUpdatedAt", async () => {
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string; updatedAt: string } };
    const res = await app.request(`/documents/${document.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedUpdatedAt: new Date(0).toISOString(),
        title: "renamed",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("DELETE cascades to sections", async () => {
    const created = await app.request("/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    const { document } = (await created.json()) as { document: { id: string } };
    const del = await app.request(`/documents/${document.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const get = await app.request(`/documents/${document.id}`);
    expect(get.status).toBe(404);
  });
});
