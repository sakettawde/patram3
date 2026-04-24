import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { sectionsRouter } from "./sections";
import { documentsRouter } from "./documents";
import { documents, workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
let docId: string;
const USER = "u";

describe("section versions", () => {
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
    app.route("/documents", documentsRouter);
    app.route("/", sectionsRouter);
  });
  afterAll(async () => closeTestDb());

  it("creates sequential version numbers starting at 1", async () => {
    const s = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const section = (await s.json()) as { id: string; version: number };
    const v1 = await app.request(`/sections/${section.id}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changeSummary: "first" }),
    });
    expect(v1.status).toBe(201);
    const v1body = (await v1.json()) as { versionNumber: number };
    expect(v1body.versionNumber).toBe(1);
    const v2 = await app.request(`/sections/${section.id}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const v2body = (await v2.json()) as { versionNumber: number };
    expect(v2body.versionNumber).toBe(2);
  });

  it("does not affect sections.version", async () => {
    const s = await app.request(`/documents/${docId}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const section = (await s.json()) as { id: string; version: number };
    await app.request(`/sections/${section.id}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const get = await app.request(`/documents/${docId}`);
    const body = (await get.json()) as { sections: Array<{ id: string; version: number }> };
    const same = body.sections.find((x) => x.id === section.id);
    expect(same?.version).toBe(1);
  });
});
