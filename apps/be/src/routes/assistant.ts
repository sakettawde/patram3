import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getAgentId, getClient } from "../lib/anthropic";
import { translate, isProposeName, type WireEvent } from "../lib/assistant-translate";
import { documentJsonToMarkdown, ensureBlockIds } from "../lib/document-markdown";
import { withAuth } from "../middleware/auth";
import { getDb } from "../db/client";
import { documents } from "../db/schema";

type Env = { Bindings: CloudflareBindings; Variables: { userId: string } };

const app = new Hono<Env>();

// Healthz is unauthed so external uptime monitors can hit it; everything else
// goes through withAuth.
app.get("/healthz", (c) => c.json({ ok: true }));

app.use("*", withAuth());

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
  documentId: string;
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
  if (!body.documentId || typeof body.documentId !== "string") {
    return c.json({ error: "missing_document_id" }, 400);
  }

  const userId = c.get("userId");
  const db = getDb(c.env.DB);

  // Load the document scoped to this user.
  const [docRow] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, body.documentId), eq(documents.userId, userId)))
    .limit(1);
  if (!docRow) return c.json({ error: "document_not_found" }, 404);

  // Parse contentJson, defensively stamp any missing block ids, and convert to
  // Markdown for the agent context. If we had to stamp ids, persist the result
  // so the FE picks up the same ids on its next read — keeping the agent's view
  // and the editor's view in sync.
  let docMarkdown = "";
  try {
    const parsed = JSON.parse(docRow.contentJson) as Parameters<typeof ensureBlockIds>[0];
    if (ensureBlockIds(parsed)) {
      const updatedContentJson = JSON.stringify(parsed);
      await db
        .update(documents)
        .set({ contentJson: updatedContentJson, updatedAt: Date.now() })
        .where(and(eq(documents.id, docRow.id), eq(documents.userId, userId)));
    }
    docMarkdown = documentJsonToMarkdown(parsed);
  } catch {
    // Fall back to empty string — the agent still gets the document header.
  }

  const docContextBlock = {
    type: "text" as const,
    text:
      `You are editing this document. Each block is preceded by an HTML comment with its id.\n` +
      `Use the propose_replace_block / propose_insert_block_after / propose_delete_block tools ` +
      `to make changes; refer to blocks by the ids shown.\n\n` +
      `--- BEGIN DOCUMENT (id:${docRow.id}, title:${JSON.stringify(docRow.title)}) ---\n` +
      docMarkdown +
      `--- END DOCUMENT ---`,
  };

  const client = getClient(c.env);
  const blocks = toContentBlocks(body.text, body.attachments);

  // Forward the user message before opening the stream so the agent has the
  // turn's input ready by the time we start reading events.
  try {
    await client.beta.sessions.events.send(sessionId, {
      events: [{ type: "user.message", content: [docContextBlock, ...blocks] }],
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
      // Track in-flight propose_* acks. Cloudflare Workers can tear down the
      // execution context as soon as the response stream closes, which would
      // abandon any unresolved promises — including these acks. If even one
      // ack is dropped, the next user.message hits a 400 ("waiting on
      // responses to events [...]"). So we collect the ack promises and
      // await them before returning from start().
      const pendingAcks: Promise<unknown>[] = [];

      try {
        for await (const ev of stream) {
          // Auto-ack propose_* tool calls so the agent keeps streaming.
          // SDK v0.91.1: event type "user.custom_tool_result", field
          // "custom_tool_use_id" (verified in events.d.ts).
          if (
            ev &&
            typeof ev === "object" &&
            (ev as { type?: string }).type === "agent.custom_tool_use" &&
            typeof (ev as { name?: string }).name === "string" &&
            isProposeName((ev as { name: string }).name) &&
            typeof (ev as { id?: string }).id === "string"
          ) {
            const customToolUseId = (ev as { id: string }).id;
            pendingAcks.push(
              client.beta.sessions.events
                .send(sessionId, {
                  events: [
                    {
                      type: "user.custom_tool_result",
                      custom_tool_use_id: customToolUseId,
                      content: [{ type: "text", text: "ok" }],
                    },
                  ],
                })
                .catch(() => undefined),
            );
          }

          for (const wire of translate(ev)) {
            controller.enqueue(encodeSSE(wire));
            if (wire.type === "message_end") {
              await Promise.all(pendingAcks);
              controller.close();
              return;
            }
          }
        }
        // Fallback: iterator ended without an idle/terminated event.
        await Promise.all(pendingAcks);
        controller.enqueue(encodeSSE({ type: "message_end" }));
        controller.close();
      } catch (err) {
        // Even on stream error, drain any in-flight acks so the session
        // doesn't end up wedged waiting on tool results.
        await Promise.all(pendingAcks).catch(() => undefined);
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
