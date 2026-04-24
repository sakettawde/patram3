import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { createAuth } from "../auth";
import { requireSession } from "./auth";
import { closeTestDb, getTestDb, type TestDb } from "../test/harness";

let db: TestDb;
let auth: ReturnType<typeof createAuth>;

describe("auth middleware", () => {
  beforeAll(async () => {
    db = await getTestDb();
    auth = createAuth(db, { secret: "x".repeat(64), baseURL: "http://localhost:8787" });
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("returns 401 when no session header is present", async () => {
    const app = new Hono().use("*", requireSession(auth, db)).get("/ping", (c) => c.text("ok"));
    const res = await app.request("/ping");
    expect(res.status).toBe(401);
  });
});
