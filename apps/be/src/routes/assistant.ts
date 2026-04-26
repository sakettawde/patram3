import { Hono } from "hono";
import { getAgentId, getClient } from "../lib/anthropic";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_PDF = "application/pdf";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

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

app.post("/files", async (c) => {
  // Pre-check before buffering: refuse if Content-Length declares too large.
  const lenHeader = c.req.header("content-length");
  if (lenHeader && Number(lenHeader) > MAX_FILE_BYTES) {
    return c.json({ error: "file_too_large" }, 413);
  }

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "missing_file" }, 400);
  if (file.size > MAX_FILE_BYTES) return c.json({ error: "file_too_large" }, 413);

  const isImage = ALLOWED_IMAGE.has(file.type);
  const isPdf = file.type === ALLOWED_PDF;
  if (!isImage && !isPdf) return c.json({ error: "unsupported_type" }, 415);

  // SDK 0.91.1: files API is under client.beta.files.upload(), not client.files.create()
  // FileUploadParams accepts { file: Uploadable } where File (Web API) satisfies Uploadable directly.
  // Response is FileMetadata with an .id field.
  const client = getClient(c.env);
  const uploaded = await client.beta.files.upload({ file });

  return c.json({
    fileId: uploaded.id,
    kind: isImage ? "image" : "pdf",
    name: file.name,
    size: file.size,
  });
});

export default app;
