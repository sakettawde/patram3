import { Hono } from "hono";
import { createAuth } from "./auth";
import { createDb } from "./db/client";
import { parseEnv } from "./env";
import { requireSession, type AuthEnv } from "./middleware/auth";
import { commentsRouter } from "./routes/comments";
import { devRouter } from "./routes/dev";
import { documentsRouter } from "./routes/documents";
import { meRouter } from "./routes/me";
import { sectionsRouter } from "./routes/sections";

type Bindings = Record<string, string | undefined>;

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.json({ ok: true }));

app.all("/auth/*", async (c) => {
  const env = parseEnv(c.env as Record<string, string | undefined>);
  const db = createDb(env.DATABASE_URL);
  const auth = createAuth(db, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL });
  return auth.handler(c.req.raw);
});

// From here on, every route requires an authenticated session.
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/auth") || c.req.path === "/health") return next();
  const env = parseEnv(c.env as Record<string, string | undefined>);
  const db = createDb(env.DATABASE_URL);
  const auth = createAuth(db, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL });
  return requireSession(auth, db)(
    c as unknown as Parameters<ReturnType<typeof requireSession>>[0],
    next,
  );
});

// Typed sub-routers sit under the universal auth gate.
const authed = app as unknown as Hono<AuthEnv>;

const routes = authed
  .route("/me", meRouter)
  .route("/documents", documentsRouter)
  .route("/", sectionsRouter)
  .route("/", commentsRouter);

// /dev/* is only reachable when DEV_SEED=1 in the environment.
routes.use("/dev/*", async (c, next) => {
  const env = parseEnv(c.env as Record<string, string | undefined>);
  if (!env.DEV_SEED) return c.json({ error: "not_found" }, 404);
  return next();
});

const final = routes.route("/dev", devRouter);

export type AppType = typeof final;
export default final;
