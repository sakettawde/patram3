import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { commentsRouter } from "./comments";
import { documents, workspaceMembers, workspaces } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { closeTestDb, getTestDb, truncateAll, type TestDb } from "../test/harness";
import { keyAfter } from "../lib/order-key";
import { createSection } from "../services/section-write";

let db: TestDb;
let app: Hono<AuthEnv>;
let wsId: string;
let sectionId: string;
const USER = "u1";
const OTHER = "u2";

describe("comments routes", () => {
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
    const section = await createSection(db, {
      documentId: doc!.id,
      userId: USER,
      orderKey: keyAfter(null),
      contentJson: { type: "doc", content: [] },
    });
    sectionId = section.id;

    app = new Hono<AuthEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: USER, workspaceId: wsId, role: "owner" });
      await next();
    });
    app.route("/", commentsRouter);
  });
  afterAll(async () => closeTestDb());

  it("creates a thread with first comment", async () => {
    const res = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hello" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { thread: { id: string }; comments: unknown[] };
    expect(body.thread.id).toBeTruthy();
    expect(body.comments).toHaveLength(1);
  });

  it("non-author cannot edit a comment", async () => {
    const create = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "mine" }),
    });
    const body = (await create.json()) as { comments: Array<{ id: string }> };
    const commentId = body.comments[0]!.id;

    const other = new Hono<AuthEnv>();
    other.use("*", async (c, next) => {
      c.set("db", db);
      c.set("auth", { userId: OTHER, workspaceId: wsId, role: "owner" });
      await next();
    });
    other.route("/", commentsRouter);
    const res = await other.request(`/comments/${commentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hacked" }),
    });
    expect(res.status).toBe(403);
  });

  it("deleting last comment deletes thread", async () => {
    const create = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "only" }),
    });
    const body = (await create.json()) as {
      thread: { id: string };
      comments: Array<{ id: string }>;
    };
    const del = await app.request(`/comments/${body.comments[0]!.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const list = await app.request(`/sections/${sectionId}/threads`);
    expect((await list.json()) as unknown[]).toHaveLength(0);
  });

  it("resolve flips status and sets resolvedAt", async () => {
    const create = await app.request(`/sections/${sectionId}/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "q" }),
    });
    const { thread } = (await create.json()) as { thread: { id: string } };
    const res = await app.request(`/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; resolvedAt: string | null };
    expect(body.status).toBe("resolved");
    expect(body.resolvedAt).toBeTruthy();
  });
});
