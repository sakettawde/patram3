// Integration test harness.
//
// WARNING: `truncateAll(db)` deletes every row in the app tables. It runs
// against whatever `DATABASE_URL` resolves to. Only run against a disposable
// dev database. Do not point this at anything you care about.

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../db/schema";

if (!process.env.DATABASE_URL) {
  loadDotenv({ path: resolve(process.cwd(), ".dev.vars") });
  loadDotenv({ path: resolve(process.cwd(), "apps/be/.dev.vars") });
}

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: TestDb | null = null;
let cachedClient: ReturnType<typeof postgres> | null = null;

export async function getTestDb(): Promise<TestDb> {
  if (cachedDb) return cachedDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set for tests (looked in env and .dev.vars)");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  const migrationsFolder = resolve(process.cwd(), "src/db/migrations");
  await migrate(db, { migrationsFolder });
  cachedClient = client;
  cachedDb = db;
  return db;
}

export async function truncateAll(db: TestDb): Promise<void> {
  await db.execute(sql`
    truncate table
      section_links,
      section_versions,
      comments,
      comment_threads,
      ai_suggestions,
      sections,
      relationships,
      documents,
      workspace_members,
      workspaces
    restart identity cascade
  `);
}

export async function closeTestDb(): Promise<void> {
  if (cachedClient) await cachedClient.end();
  cachedClient = null;
  cachedDb = null;
}
