import { Hono } from "hono";
import { getAgentId, getClient } from "../lib/anthropic";
import { translate, type WireEvent } from "../lib/assistant-translate";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_PDF = "application/pdf";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

type Attachment =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; content: string };

type SendBody = {
  text: string;
  attachments: Attachment[];
  // environmentId is part of the FE -> BE contract for future routing; v1 BE
  // does not consume it. Keep accepting it so the FE shape stays stable.
  environmentId: string;
};

// Build user.message content blocks. SDK v0.91.1 source shapes verified in
// node_modules/@anthropic-ai/sdk/resources/beta/sessions/events.d.ts:
//   FileImageSource    = { type: "file", file_id }
//   FileDocumentSource = { type: "file", file_id }
//   TextBlock          = { type: "text", text }
function toContentBlocks(text: string, attachments: Attachment[]) {
  const blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "file"; file_id: string } }
    | { type: "document"; source: { type: "file"; file_id: string } }
  > = [];

  for (const att of attachments) {
    if (att.kind === "image") {
      blocks.push({ type: "image", source: { type: "file", file_id: att.fileId } });
    } else if (att.kind === "pdf") {
      blocks.push({ type: "document", source: { type: "file", file_id: att.fileId } });
    } else if (att.kind === "text") {
      blocks.push({ type: "text", text: `Attached file: ${att.name}\n\n${att.content}` });
    }
  }

  if (text.trim().length > 0) {
    blocks.push({ type: "text", text });
  }

  return blocks;
}

function encodeSSE(event: WireEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

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

app.post("/sessions/:sessionId/messages", async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = (await c.req.json().catch(() => null)) as SendBody | null;
  if (!body || typeof body.text !== "string" || !Array.isArray(body.attachments)) {
    return c.json({ error: "invalid_body" }, 400);
  }

  const client = getClient(c.env);
  const blocks = toContentBlocks(body.text, body.attachments);

  // Forward the user message before opening the stream so the agent has the
  // turn's input ready by the time we start reading events.
  try {
    await client.beta.sessions.events.send(sessionId, {
      events: [{ type: "user.message", content: blocks }],
    });
  } catch (err) {
    return c.json(
      {
        error: "send_failed",
        message: err instanceof Error ? err.message : "send_failed",
      },
      502,
    );
  }

  const stream = await client.beta.sessions.events.stream(sessionId);

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of stream) {
          for (const wire of translate(ev)) {
            controller.enqueue(encodeSSE(wire));
            if (wire.type === "message_end") {
              controller.close();
              return;
            }
          }
        }
        // Fallback: iterator ended without an idle/terminated event.
        controller.enqueue(encodeSSE({ type: "message_end" }));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encodeSSE({
            type: "error",
            message: err instanceof Error ? err.message : "stream_error",
            retryable: true,
          }),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
});

// SDK v0.91.1 investigation result:
//   client.beta.sessions        → create / retrieve / update / list / delete / archive
//   client.beta.sessions.events → list / send / stream
// There is NO cancel(), stop(), or abort() method on either resource.
// The closest approximation is sending a user.interrupt event, which pauses the
// running agent turn. We fire it best-effort; the FE-side AbortController close
// is the actual stream cancel. This route exists for forward-compatibility and
// to stop unnecessary compute when the FE disconnects.
app.post("/sessions/:sessionId/cancel", async (c) => {
  const sessionId = c.req.param("sessionId");
  const client = getClient(c.env);
  try {
    // Best-effort: send a user.interrupt event to stop the running agent turn.
    // SDK v0.91.1 has no dedicated cancel method; user.interrupt is the closest
    // available signal (pauses agent execution and returns session to idle).
    await client.beta.sessions.events.send(sessionId, {
      events: [{ type: "user.interrupt" }],
    });
  } catch {
    // Best-effort — don't surface errors to the FE.
  }
  return c.json({ ok: true });
});

export default app;
