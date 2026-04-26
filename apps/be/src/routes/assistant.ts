import { Hono } from "hono";
import { getAgentId, getClient } from "../lib/anthropic";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

app.get("/healthz", (c) => c.json({ ok: true }));

app.post("/sessions", async (c) => {
  const client = getClient(c.env);
  const agentId = getAgentId(c.env);

  const environment = await client.beta.environments.create({
    name: `patram-session-${Date.now()}`,
  });

  const session = await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: "agent", id: agentId },
  });

  return c.json({ sessionId: session.id, environmentId: environment.id });
});

export default app;
