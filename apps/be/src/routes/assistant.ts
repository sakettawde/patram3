import { Hono } from "hono";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

app.get("/healthz", (c) => c.json({ ok: true }));

export default app;
