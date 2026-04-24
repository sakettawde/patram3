import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { Db } from "./db/client";
import { workspaceMembers, workspaces } from "./db/schema";

export type AuthInstance = ReturnType<typeof createAuth>;

export function createAuth(db: Db, opts: { secret: string; baseURL: string }) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: "/auth",
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    databaseHooks: {
      user: {
        create: {
          async after(user) {
            await db.transaction(async (tx) => {
              const slug = await uniqueSlug(tx, user.email ?? `user-${user.id}`);
              const [ws] = await tx
                .insert(workspaces)
                .values({ name: `${slug}'s workspace`, slug })
                .returning();
              if (!ws) throw new Error("workspace insert failed");
              await tx.insert(workspaceMembers).values({
                workspaceId: ws.id,
                userId: user.id,
                role: "owner",
              });
            });
          },
        },
      },
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uniqueSlug(tx: PgDatabase<any, any, any>, seed: string): Promise<string> {
  const base =
    seed
      .split("@")[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "user";
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const rows = await tx.execute(sql`select 1 from workspaces where slug = ${candidate} limit 1`);
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
