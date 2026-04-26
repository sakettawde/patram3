# Claude Managed Agents Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mocked assistant reply path with a real streaming integration to Anthropic's Managed Agents (beta) API, with per-message file attachments (images, PDFs, text/code), an activity strip surfacing tool/thinking steps, and a stop button.

**Architecture:** FE localStorage stays the source of truth for messages (option A in the spec); BE is a stateless Hono-on-Workers proxy over the Anthropic TS SDK with four endpoints (`/assistant/sessions`, `/assistant/files`, `/assistant/sessions/:id/messages` (SSE), `/assistant/sessions/:id/cancel`). The BE normalizes Anthropic's stream events into a small wire format (`message_start`, `text_delta`, `activity`, `message_end`, `error`) so FE rendering is insulated from SDK changes.

**Tech Stack:**

- BE: Hono, `@anthropic-ai/sdk` (beta), Cloudflare Workers, Wrangler.
- FE: TanStack Start (React 19), Zustand vanilla + persist, vite-plus/test (jsdom), Tailwind 4, Radix, lucide-react. Markdown via `react-markdown` + `remark-gfm` (added in this plan).
- Spec: [docs/superpowers/specs/2026-04-26-claude-managed-agents-integration-design.md](../specs/2026-04-26-claude-managed-agents-integration-design.md).

**Out-of-scope decisions baked into this plan:**

- No BE unit tests in v1. The existing BE has no test infra; setting it up is its own piece of work. BE behavior is verified by FE integration tests (mocked at the network boundary) plus manual end-to-end smoke. This matches the pattern already used for `/users`.
- No D1 schema additions. v1 is pure proxy.
- No multi-agent / per-user agent. `ANTHROPIC_AGENT_ID` is a single Wrangler secret.

---

## File map

| Path                                                   | Change | Responsibility                                                                                        |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| `apps/be/package.json`                                 | modify | add `@anthropic-ai/sdk`                                                                               |
| `apps/be/wrangler.jsonc`                               | modify | document `ANTHROPIC_API_KEY`, `ANTHROPIC_AGENT_ID` secrets; enable `nodejs_compat` if SDK requires it |
| `apps/be/src/lib/anthropic.ts`                         | new    | per-request SDK client factory with beta header                                                       |
| `apps/be/src/routes/assistant.ts`                      | new    | sessions, files (multipart), messages (SSE), cancel                                                   |
| `apps/be/src/index.ts`                                 | modify | mount `/assistant` router                                                                             |
| `apps/fe/package.json`                                 | modify | add `react-markdown`, `remark-gfm`                                                                    |
| `apps/fe/src/lib/sse.ts`                               | new    | SSE parser over `fetch` + `ReadableStreamDefaultReader`                                               |
| `apps/fe/src/lib/assistant-api.ts`                     | new    | typed BE client                                                                                       |
| `apps/fe/src/stores/assistant.ts`                      | modify | extend session shape; replace mock with real streaming path                                           |
| `apps/fe/src/components/assistant/markdown.tsx`        | new    | markdown renderer with code-block copy                                                                |
| `apps/fe/src/components/assistant/attachment-chip.tsx` | new    | per-attachment chip (image/pdf/text), upload progress, remove, retry                                  |
| `apps/fe/src/components/assistant/attachment-row.tsx`  | new    | composer attachment row + file-picker                                                                 |
| `apps/fe/src/components/assistant/activity-strip.tsx`  | new    | collapsible step list above streaming bubble                                                          |
| `apps/fe/src/components/assistant/composer.tsx`        | modify | accept attachments, expose stop while streaming                                                       |
| `apps/fe/src/components/assistant/message-bubble.tsx`  | modify | markdown for assistant role, attachment chips for user role                                           |
| `apps/fe/src/components/assistant/message-list.tsx`    | modify | render in-progress streaming bubble (text + activity)                                                 |
| `apps/fe/src/components/assistant/assistant-panel.tsx` | modify | wire new composer signature; no behavioral change                                                     |

Test files are co-located with each module (`*.test.ts(x)`).

---

## Wire format reference

Used by the SSE stream from `POST /assistant/sessions/:id/messages`. Every line is `data: <json>\n\n`.

```ts
type WireEvent =
  | { type: "message_start"; id: string; createdAt: number }
  | { type: "text_delta"; delta: string }
  | {
      type: "activity";
      kind: "tool_use" | "tool_result" | "thinking" | "status";
      label: string;
      summary?: string;
    }
  | { type: "message_end"; usage?: { input_tokens: number; output_tokens: number } }
  | { type: "error"; message: string; retryable: boolean };
```

Used by `POST /assistant/sessions/:id/messages` request body:

```ts
type Attachment =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; content: string };

type SendBody = {
  text: string;
  attachments: Attachment[];
  environmentId: string;
};
```

Used by `POST /assistant/sessions` response and `POST /assistant/files` response:

```ts
type CreateSessionResponse = { sessionId: string; environmentId: string };
type UploadFileResponse = {
  fileId: string;
  kind: "image" | "pdf";
  name: string;
  size: number;
};
```

---

## Task 1: BE — install SDK, declare secrets, mount router skeleton

**Files:**

- Modify: `apps/be/package.json`
- Modify: `apps/be/wrangler.jsonc`
- Modify: `apps/be/src/index.ts`
- Create: `apps/be/src/routes/assistant.ts`

- [ ] **Step 1: Add `@anthropic-ai/sdk` to BE deps**

```bash
vp add -F be @anthropic-ai/sdk
```

Verify it lands in `apps/be/package.json` under `dependencies`.

- [ ] **Step 2: Document the new secrets in `wrangler.jsonc`**

Edit `apps/be/wrangler.jsonc` — leave the `vars` block commented (secrets are not vars), but add an inline comment listing the required secrets. The secrets themselves are set via `wrangler secret put` (see Step 4).

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "patram3-be",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-23",
  // Required secrets (set with `wrangler secret put`):
  //   ANTHROPIC_API_KEY  - Anthropic API key (begins with "sk-ant-")
  //   ANTHROPIC_AGENT_ID - id of the agent created in the Anthropic console
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "patram3-db",
      "database_id": "2cef8722-898f-4f9c-9de7-4f2a9f2413eb",
      "migrations_dir": "drizzle",
    },
  ],
}
```

- [ ] **Step 3: Regenerate Cloudflare types so `c.env` knows about the secrets**

```bash
vp run be#cf-typegen
```

Open `apps/be/worker-configuration.d.ts` and confirm `ANTHROPIC_API_KEY` and `ANTHROPIC_AGENT_ID` appear on the `CloudflareBindings` interface. If they don't show up (Wrangler infers secrets from `.dev.vars` / actual deployment), manually add them:

```ts
// apps/be/worker-configuration.d.ts
interface CloudflareBindings {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_AGENT_ID: string;
}
```

- [ ] **Step 4: Set up local secrets for `wrangler dev`**

Create (or edit) `apps/be/.dev.vars`:

```
ANTHROPIC_API_KEY=sk-ant-…
ANTHROPIC_AGENT_ID=agt_…
```

Add `.dev.vars` to `apps/be/.gitignore` if not already:

```bash
grep -q '^\.dev\.vars$' apps/be/.gitignore 2>/dev/null || echo '.dev.vars' >> apps/be/.gitignore
```

- [ ] **Step 5: Create the empty router and mount it**

Create `apps/be/src/routes/assistant.ts`:

```ts
import { Hono } from "hono";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

app.get("/healthz", (c) => c.json({ ok: true }));

export default app;
```

Modify `apps/be/src/index.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import users from "./routes/users";
import assistant from "./routes/assistant";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

app.use("*", cors({ origin: ["http://localhost:3000"], credentials: false }));

app.get("/", (c) => c.text("patram3-be"));
app.route("/users", users);
app.route("/assistant", assistant);

export default app;
```

- [ ] **Step 6: Verify**

```bash
vp run be#dev
```

In another shell:

```bash
curl -s http://localhost:8787/assistant/healthz
```

Expected: `{"ok":true}`.

- [ ] **Step 7: Commit**

```bash
git add apps/be/package.json pnpm-lock.yaml apps/be/wrangler.jsonc apps/be/worker-configuration.d.ts apps/be/.gitignore apps/be/src/routes/assistant.ts apps/be/src/index.ts
git commit -m "feat(be): scaffold /assistant router and Anthropic SDK install"
```

(Do NOT commit `.dev.vars`.)

---

## Task 2: BE — Anthropic SDK client factory

**Files:**

- Create: `apps/be/src/lib/anthropic.ts`

- [ ] **Step 1: Implement the factory**

```ts
// apps/be/src/lib/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";

const BETA_HEADER = "agents-2025-12-01"; // Managed Agents beta. Confirm against the SDK README during integration.

export function getClient(env: CloudflareBindings): Anthropic {
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    defaultHeaders: { "anthropic-beta": BETA_HEADER },
  });
}

export function getAgentId(env: CloudflareBindings): string {
  return env.ANTHROPIC_AGENT_ID;
}
```

NOTE: `BETA_HEADER` value comes from the SDK's managed-agents docs. If the integrator finds a different header name in the version they install, update this constant. The SDK's `client.beta.*` methods may already inject it — if so, the `defaultHeaders` line can be deleted. Verify by attempting `client.beta.environments.create(...)` once and check the request the SDK makes.

- [ ] **Step 2: Commit**

```bash
git add apps/be/src/lib/anthropic.ts
git commit -m "feat(be): Anthropic SDK client factory for managed agents"
```

---

## Task 3: BE — `POST /assistant/sessions`

Creates an Anthropic environment, then a session bound to the configured agent. Returns both ids.

**Files:**

- Modify: `apps/be/src/routes/assistant.ts`

- [ ] **Step 1: Add the route**

```ts
// apps/be/src/routes/assistant.ts
import { Hono } from "hono";
import { getClient, getAgentId } from "../lib/anthropic";

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
```

- [ ] **Step 2: Manual verify**

With `vp run be#dev` running:

```bash
curl -s -X POST http://localhost:8787/assistant/sessions
```

Expected JSON like `{"sessionId":"sess_…","environmentId":"env_…"}`. If the SDK errors with "unknown method `beta.environments.create`", install the latest `@anthropic-ai/sdk` (the managed-agents API ships under `beta.*` and may have moved between minor versions). If the error is auth, double-check `.dev.vars`.

- [ ] **Step 3: Commit**

```bash
git add apps/be/src/routes/assistant.ts
git commit -m "feat(be): POST /assistant/sessions creates env + session"
```

---

## Task 4: BE — `POST /assistant/files` (multipart upload)

Forwards a single file to the Anthropic Files API and returns a normalized response.

**Files:**

- Modify: `apps/be/src/routes/assistant.ts`

- [ ] **Step 1: Add the route**

Append to the router from Task 3:

```ts
const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_PDF = "application/pdf";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB; matches Anthropic Files API guidance.

app.post("/files", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "missing_file" }, 400);
  if (file.size > MAX_FILE_BYTES) return c.json({ error: "file_too_large" }, 413);

  const isImage = ALLOWED_IMAGE.has(file.type);
  const isPdf = file.type === ALLOWED_PDF;
  if (!isImage && !isPdf) return c.json({ error: "unsupported_type" }, 415);

  const client = getClient(c.env);
  const uploaded = await client.files.create({ file });

  return c.json({
    fileId: uploaded.id,
    kind: isImage ? "image" : "pdf",
    name: file.name,
    size: file.size,
  });
});
```

NOTE: `client.files.create({ file })` accepts a Web `File`/`Blob` directly in the TS SDK. If the SDK at the installed version requires a different shape (e.g. `{ file: { name, data } }`), adapt — but don't read the file twice.

- [ ] **Step 2: Manual verify**

```bash
curl -s -X POST -F "file=@/path/to/test.png" http://localhost:8787/assistant/files
```

Expected `{"fileId":"file_…","kind":"image","name":"test.png","size":…}`.

Test rejection paths:

```bash
curl -s -X POST http://localhost:8787/assistant/files
# → 400 missing_file

curl -s -X POST -F "file=@/path/to/script.js" http://localhost:8787/assistant/files
# → 415 unsupported_type
```

- [ ] **Step 3: Commit**

```bash
git add apps/be/src/routes/assistant.ts
git commit -m "feat(be): POST /assistant/files uploads to Anthropic Files API"
```

---

## Task 5: BE — `POST /assistant/sessions/:sessionId/messages` (SSE)

Sends a `user.message` event to the Anthropic session, opens the agent stream, normalizes events to the wire format, and pipes them as SSE.

**Files:**

- Modify: `apps/be/src/routes/assistant.ts`

- [ ] **Step 1: Add helper to assemble Anthropic content blocks**

Append to the file:

```ts
type Attachment =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; content: string };

type SendBody = {
  text: string;
  attachments: Attachment[];
  environmentId: string;
};

function toContentBlocks(text: string, attachments: Attachment[]) {
  // Anthropic content block shape (verify against installed SDK types).
  type Block =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "file"; file_id: string } }
    | { type: "document"; source: { type: "file"; file_id: string } };

  const blocks: Block[] = [];
  for (const a of attachments) {
    if (a.kind === "image") {
      blocks.push({ type: "image", source: { type: "file", file_id: a.fileId } });
    } else if (a.kind === "pdf") {
      blocks.push({ type: "document", source: { type: "file", file_id: a.fileId } });
    } else {
      blocks.push({ type: "text", text: `Attached file: ${a.name}\n\n${a.content}` });
    }
  }
  if (text.trim() !== "") blocks.push({ type: "text", text });
  return blocks;
}
```

- [ ] **Step 2: Add helpers to translate Anthropic events to the wire format**

```ts
type WireEvent =
  | { type: "message_start"; id: string; createdAt: number }
  | { type: "text_delta"; delta: string }
  | {
      type: "activity";
      kind: "tool_use" | "tool_result" | "thinking" | "status";
      label: string;
      summary?: string;
    }
  | { type: "message_end"; usage?: { input_tokens: number; output_tokens: number } }
  | { type: "error"; message: string; retryable: boolean };

function encodeSSE(event: WireEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

// Map a single Anthropic event to zero or more wire events.
// Anthropic event shapes vary by SDK version; this mapping handles the documented set.
// Unknown event types are dropped (do not forward raw SDK shapes — that breaks the contract).
function translate(ev: unknown): WireEvent[] {
  // The SDK exposes typed events; until the integrator imports the right type,
  // we narrow defensively.
  const e = ev as { type?: string; [k: string]: unknown };
  switch (e.type) {
    case "agent.message.start": {
      return [{ type: "message_start", id: String(e.id ?? ""), createdAt: Date.now() }];
    }
    case "agent.text.delta": {
      const delta = typeof e.delta === "string" ? e.delta : "";
      return delta ? [{ type: "text_delta", delta }] : [];
    }
    case "agent.tool_use": {
      const name = typeof e.name === "string" ? e.name : "tool";
      return [{ type: "activity", kind: "tool_use", label: `Using ${name}`, summary: undefined }];
    }
    case "agent.tool_result": {
      return [{ type: "activity", kind: "tool_result", label: "Tool finished" }];
    }
    case "agent.thinking": {
      return [{ type: "activity", kind: "thinking", label: "Thinking…" }];
    }
    case "session.status_idle": {
      return [{ type: "message_end" }];
    }
    case "agent.error":
    case "session.error": {
      return [
        {
          type: "error",
          message: String(e.message ?? "Unknown error"),
          retryable: true,
        },
      ];
    }
    default:
      return [];
  }
}
```

NOTE on event names: the names above (`agent.message.start`, `agent.text.delta`, etc.) are placeholders for the documented Anthropic event types. The SDK's TypeScript types will tell you the exact strings — open the `.d.ts` for `client.beta.sessions.events.stream` and adapt this `switch` to match. Keep the wire format on the right side of the switch unchanged; only the input names change.

- [ ] **Step 3: Add the route**

```ts
app.post("/sessions/:sessionId/messages", async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = (await c.req.json().catch(() => null)) as SendBody | null;
  if (!body || typeof body.text !== "string" || !Array.isArray(body.attachments)) {
    return c.json({ error: "invalid_body" }, 400);
  }

  const client = getClient(c.env);
  const blocks = toContentBlocks(body.text, body.attachments);

  // Send the user turn.
  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.message", content: blocks }],
  });

  // Open the agent stream.
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
        // Fallback close if the iterator ends without a session.status_idle.
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
```

- [ ] **Step 4: Manual verify**

Run `vp run be#dev` and:

```bash
SID=$(curl -s -X POST http://localhost:8787/assistant/sessions | jq -r .sessionId)
ENV=$(curl -s -X POST http://localhost:8787/assistant/sessions | jq -r .environmentId)
# Use the most recent pair; replace ENV with the matching environmentId from the session call above.

curl -N -X POST http://localhost:8787/assistant/sessions/$SID/messages \
  -H 'content-type: application/json' \
  -d "{\"text\":\"Say hi in one word.\",\"attachments\":[],\"environmentId\":\"$ENV\"}"
```

Expected: a stream of `data: {…}\n\n` lines starting with `message_start`, ending with `message_end`. If you see `error` events with retryable: true, inspect the error message — most often a wrong beta header or wrong event-type names.

- [ ] **Step 5: Commit**

```bash
git add apps/be/src/routes/assistant.ts
git commit -m "feat(be): SSE messages endpoint with normalized wire format"
```

---

## Task 6: BE — `POST /assistant/sessions/:sessionId/cancel`

Best-effort signal to end the agent's current turn. The FE has already aborted the SSE; this prevents Anthropic from continuing to bill compute.

**Files:**

- Modify: `apps/be/src/routes/assistant.ts`

- [ ] **Step 1: Add the route**

```ts
app.post("/sessions/:sessionId/cancel", async (c) => {
  const sessionId = c.req.param("sessionId");
  const client = getClient(c.env);
  // SDK exposes cancel under sessions.events or sessions directly depending on version.
  // Try `client.beta.sessions.cancel` first; fall back to a no-op if unavailable.
  try {
    if ("cancel" in client.beta.sessions) {
      // @ts-expect-error - method presence varies by SDK version
      await client.beta.sessions.cancel(sessionId);
    } else if ("cancel" in client.beta.sessions.events) {
      // @ts-expect-error - method presence varies by SDK version
      await client.beta.sessions.events.cancel(sessionId);
    }
  } catch {
    // Swallow — cancel is best-effort.
  }
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Manual verify**

```bash
curl -s -X POST http://localhost:8787/assistant/sessions/sess_abc/cancel
```

Expected `{"ok":true}` regardless of session state.

- [ ] **Step 3: Commit**

```bash
git add apps/be/src/routes/assistant.ts
git commit -m "feat(be): best-effort POST /assistant/sessions/:id/cancel"
```

---

## Task 7: FE — install markdown deps

**Files:**

- Modify: `apps/fe/package.json`

- [ ] **Step 1: Add deps**

```bash
vp add -F fe react-markdown remark-gfm
```

- [ ] **Step 2: Commit**

```bash
git add apps/fe/package.json pnpm-lock.yaml
git commit -m "chore(fe): add react-markdown + remark-gfm for assistant rendering"
```

---

## Task 8: FE — SSE reader (`lib/sse.ts`)

**Files:**

- Create: `apps/fe/src/lib/sse.ts`
- Create: `apps/fe/src/lib/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/fe/src/lib/sse.test.ts
import { describe, expect, test, vi } from "vite-plus/test";
import { readSSE } from "./sse";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]!));
      else controller.close();
    },
  });
}

describe("readSSE", () => {
  test("parses one event per line and calls onEvent", async () => {
    const events: unknown[] = [];
    const stream = makeStream([
      'data: {"type":"message_start","id":"m1","createdAt":1}\n\n',
      'data: {"type":"text_delta","delta":"hi"}\n\n',
      'data: {"type":"message_end"}\n\n',
    ]);
    await readSSE(stream, { onEvent: (e) => events.push(e) });
    expect(events).toHaveLength(3);
    expect((events[1] as { delta: string }).delta).toBe("hi");
  });

  test("handles event split across chunks", async () => {
    const events: unknown[] = [];
    const stream = makeStream(['data: {"type":"text_d', 'elta","delta":"yo"}\n\n']);
    await readSSE(stream, { onEvent: (e) => events.push(e) });
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe("yo");
  });

  test("aborts when signal fires mid-stream", async () => {
    const events: unknown[] = [];
    const ac = new AbortController();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"type":"text_delta","delta":"a"}\n\n'));
        // Never close, never enqueue more.
      },
    });
    const p = readSSE(stream, { onEvent: (e) => events.push(e), signal: ac.signal });
    await Promise.resolve();
    ac.abort();
    await p; // should resolve, not reject
    expect(events).toHaveLength(1);
  });

  test("skips non-data lines and malformed json", async () => {
    const events: unknown[] = [];
    const stream = makeStream([
      ": comment\n\n",
      "data: not-json\n\n",
      'data: {"type":"message_end"}\n\n',
    ]);
    await readSSE(stream, { onEvent: (e) => events.push(e) });
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
vp run fe#test src/lib/sse.test.ts
```

Expected: fail (`readSSE` not exported).

- [ ] **Step 3: Implement**

```ts
// apps/fe/src/lib/sse.ts
export type ReadSSEOptions = {
  onEvent: (event: unknown) => void;
  signal?: AbortSignal;
};

export async function readSSE(
  stream: ReadableStream<Uint8Array>,
  { onEvent, signal }: ReadSSEOptions,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const onAbort = () => reader.cancel().catch(() => {});
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Split on blank-line event terminators.
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLines = raw
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        try {
          onEvent(JSON.parse(payload));
        } catch {
          // ignore malformed lines
        }
      }
    }
  } catch {
    // Reader was cancelled (signal aborted). Resolve quietly.
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
vp run fe#test src/lib/sse.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/sse.ts apps/fe/src/lib/sse.test.ts
git commit -m "feat(fe): SSE reader with abort + split-chunk handling"
```

---

## Task 9: FE — typed BE client (`lib/assistant-api.ts`)

**Files:**

- Create: `apps/fe/src/lib/assistant-api.ts`
- Create: `apps/fe/src/lib/assistant-api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/fe/src/lib/assistant-api.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createSession, uploadFile, streamMessage, cancel } from "./assistant-api";

const ORIG_FETCH = globalThis.fetch;

describe("assistant-api", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = ORIG_FETCH;
  });

  test("createSession returns ids", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "s1", environmentId: "e1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await createSession();
    expect(r).toEqual({ sessionId: "s1", environmentId: "e1" });
  });

  test("uploadFile posts multipart", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ fileId: "f1", kind: "image", name: "x.png", size: 1 })),
    );
    const file = new File(["x"], "x.png", { type: "image/png" });
    const r = await uploadFile(file);
    expect(r.fileId).toBe("f1");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body).toBeInstanceOf(
      FormData,
    );
  });

  test("streamMessage parses SSE events to onEvent", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"type":"text_delta","delta":"hi"}\n\n'));
        c.enqueue(enc.encode('data: {"type":"message_end"}\n\n'));
        c.close();
      },
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(body));
    const events: unknown[] = [];
    await streamMessage(
      "s1",
      { text: "hi", attachments: [], environmentId: "e1" },
      { onEvent: (e) => events.push(e) },
    );
    expect(events).toHaveLength(2);
  });

  test("cancel posts to /cancel", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{"ok":true}'));
    await cancel("s1");
    expect(globalThis.fetch).toHaveBeenCalled();
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toMatch(/\/sessions\/s1\/cancel$/);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
vp run fe#test src/lib/assistant-api.test.ts
```

Expected: fail.

- [ ] **Step 3: Implement**

```ts
// apps/fe/src/lib/assistant-api.ts
import { readSSE } from "./sse";

const BASE = (import.meta.env.VITE_BE_URL ?? "http://localhost:8787") + "/assistant";

export type Attachment =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; content: string };

export type SendBody = {
  text: string;
  attachments: Attachment[];
  environmentId: string;
};

export type CreateSessionResponse = { sessionId: string; environmentId: string };
export type UploadFileResponse = {
  fileId: string;
  kind: "image" | "pdf";
  name: string;
  size: number;
};

export type WireEvent =
  | { type: "message_start"; id: string; createdAt: number }
  | { type: "text_delta"; delta: string }
  | {
      type: "activity";
      kind: "tool_use" | "tool_result" | "thinking" | "status";
      label: string;
      summary?: string;
    }
  | { type: "message_end"; usage?: { input_tokens: number; output_tokens: number } }
  | { type: "error"; message: string; retryable: boolean };

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`http_${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function createSession(): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE}/sessions`, { method: "POST" });
  return jsonOrThrow(res);
}

export async function uploadFile(file: File): Promise<UploadFileResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/files`, { method: "POST", body: fd });
  return jsonOrThrow(res);
}

export async function streamMessage(
  sessionId: string,
  body: SendBody,
  opts: { onEvent: (e: WireEvent) => void; signal?: AbortSignal },
): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`http_${res.status}: ${text || res.statusText}`);
  }
  await readSSE(res.body, {
    onEvent: (e) => opts.onEvent(e as WireEvent),
    signal: opts.signal,
  });
}

export async function cancel(sessionId: string): Promise<void> {
  await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: "POST",
  }).catch(() => {});
}
```

- [ ] **Step 4: Run, verify pass**

```bash
vp run fe#test src/lib/assistant-api.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/assistant-api.ts apps/fe/src/lib/assistant-api.test.ts
git commit -m "feat(fe): typed BE client for assistant routes"
```

---

## Task 10: FE — extend store shape (no behavior change yet)

Adds new fields and the `streaming` slot. The mock `sendMessage` keeps working in this task; Task 11 swaps it for the real path. Doing this in two steps keeps the diff readable.

**Files:**

- Modify: `apps/fe/src/stores/assistant.ts`
- Modify: `apps/fe/src/stores/assistant.test.ts`

- [ ] **Step 1: Update types and persistence — show full intended shape**

Edit `apps/fe/src/stores/assistant.ts`. Change:

```ts
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};
```

to:

```ts
export type AttachmentMeta =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; size: number };

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  attachments?: AttachmentMeta[];
};
```

Change:

```ts
export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};
```

to:

```ts
export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  anthropicSessionId: string | null;
  environmentId: string | null;
};
```

Update `newSession()`:

```ts
function newSession(): ChatSession {
  const now = Date.now();
  return {
    id: nanoid(8),
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
    anthropicSessionId: null,
    environmentId: null,
  };
}
```

Add the streaming slot to `AssistantState`:

```ts
export type StreamingActivity = {
  id: string;
  kind: "tool_use" | "tool_result" | "thinking" | "status";
  label: string;
  summary?: string;
  at: number;
};

export type StreamingSlot = {
  sessionId: string;
  messageId: string;
  text: string;
  activity: StreamingActivity[];
  status: "streaming" | "cancelled" | "error";
  errorMessage?: string;
};

export type AssistantState = {
  open: boolean;
  selectedSessionId: string | null;
  sessions: Record<string, ChatSession>;
  order: string[];
  pendingSessionIds: Record<string, true>;
  streaming: StreamingSlot | null;
};
```

In `createStore<AssistantStore>()(persist(...))`, add `streaming: null` to the initial state object next to `pendingSessionIds: {}`. Keep `partialize` excluding `pendingSessionIds` and `streaming`:

```ts
partialize: (s) => ({
  open: s.open,
  selectedSessionId: s.selectedSessionId,
  sessions: s.sessions,
  order: s.order,
}),
```

- [ ] **Step 2: Add tests for the new shape**

Append to `apps/fe/src/stores/assistant.test.ts`:

```ts
test("newly created sessions have null anthropicSessionId/environmentId", () => {
  const s = createAssistantStore();
  const id = s.getState().createSession();
  const sess = s.getState().sessions[id];
  expect(sess?.anthropicSessionId).toBeNull();
  expect(sess?.environmentId).toBeNull();
});

test("messages may carry attachments metadata", () => {
  const s = createAssistantStore();
  const id = s.getState().createSession();
  // simulate a user turn with an attachment
  s.setState((st) => {
    const sess = st.sessions[id]!;
    return {
      sessions: {
        ...st.sessions,
        [id]: {
          ...sess,
          messages: [
            ...sess.messages,
            {
              id: "m1",
              role: "user",
              content: "see this",
              createdAt: 1,
              attachments: [{ kind: "image", fileId: "f1", name: "x.png", size: 10 }],
            },
          ],
        },
      },
    };
  });
  expect(s.getState().sessions[id]?.messages[0]?.attachments?.[0]?.kind).toBe("image");
});

test("streaming slot starts null and is not persisted", () => {
  const a = createAssistantStore();
  expect(a.getState().streaming).toBeNull();
  a.setState({
    streaming: {
      sessionId: "s",
      messageId: "m",
      text: "hi",
      activity: [],
      status: "streaming",
    },
  });
  // new instance from same storage → streaming reset
  const b = createAssistantStore();
  expect(b.getState().streaming).toBeNull();
});
```

- [ ] **Step 3: Run, verify pass**

```bash
vp run fe#test src/stores/assistant.test.ts
```

Expected: existing 15 tests still pass + 3 new tests pass = 18 total.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/stores/assistant.ts apps/fe/src/stores/assistant.test.ts
git commit -m "refactor(fe): extend assistant store shape for real-agent integration"
```

---

## Task 11: FE — replace mock `sendMessage` with real streaming path

This is the largest task. It removes the `setTimeout` mock and wires `assistant-api`. After this task, the assistant talks to the real backend.

**Files:**

- Modify: `apps/fe/src/stores/assistant.ts`
- Modify: `apps/fe/src/stores/assistant.test.ts`

- [ ] **Step 1: Add new actions to the store interface**

In `AssistantActions` (in `assistant.ts`), replace:

```ts
sendMessage: (content: string) => void;
```

with:

```ts
sendMessage: (content: string, attachments?: AttachmentMeta[]) => Promise<void>;
cancelStreaming: () => void;
retryLastTurn: () => Promise<void>;
```

- [ ] **Step 2: Import the API and replace the action body**

At the top of `assistant.ts`:

```ts
import * as api from "#/lib/assistant-api";
```

Remove the `pickReply` import and the `REPLY_DELAY_*` constants — they're no longer used.

Replace the entire `sendMessage` action with:

```ts
sendMessage: async (content, attachments = []) => {
  const trimmed = content.trim();
  if (trimmed === "" && attachments.length === 0) return;
  const sid = get().selectedSessionId;
  if (!sid) return;
  const session = get().sessions[sid];
  if (!session) return;

  // Lazy bootstrap of Anthropic session.
  let anthropicSessionId = session.anthropicSessionId;
  let environmentId = session.environmentId;
  if (!anthropicSessionId || !environmentId) {
    try {
      const r = await api.createSession();
      anthropicSessionId = r.sessionId;
      environmentId = r.environmentId;
      set((st) => {
        const cur = st.sessions[sid];
        if (!cur) return st;
        return {
          sessions: {
            ...st.sessions,
            [sid]: { ...cur, anthropicSessionId, environmentId },
          },
        };
      });
    } catch (err) {
      // Pre-stream failure: surface as a synthetic streaming slot in error state
      // so the bubble UI can render an inline retry without adding new types.
      set({
        streaming: {
          sessionId: sid,
          messageId: nanoid(8),
          text: "",
          activity: [],
          status: "error",
          errorMessage: err instanceof Error ? err.message : "create_session_failed",
        },
      });
      return;
    }
  }

  // Optimistic user message.
  const userMsg: ChatMessage = {
    id: nanoid(8),
    role: "user",
    content: trimmed,
    createdAt: Date.now(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
  const isFirstUserMessage = session.messages.length === 0;

  set((st) => {
    const cur = st.sessions[sid];
    if (!cur) return st;
    return {
      sessions: {
        ...st.sessions,
        [sid]: {
          ...cur,
          messages: [...cur.messages, userMsg],
          title: isFirstUserMessage ? truncateForTitle(trimmed) : cur.title,
          updatedAt: userMsg.createdAt,
        },
      },
      pendingSessionIds: { ...st.pendingSessionIds, [sid]: true },
      streaming: {
        sessionId: sid,
        messageId: nanoid(8),
        text: "",
        activity: [],
        status: "streaming",
      },
    };
  });

  // Translate FE attachment metadata into the API send shape (text content lives only on the message we just sent the API).
  // The store's attachments[] holds metadata only; the API call needs the raw text content for "text" kind.
  // We expect the caller (composer) to have already supplied that via a separate per-message buffer (see Task 13/14).
  // For attachments without inline content, we forward the FE shape directly.
  const apiAttachments = attachments.map<api.Attachment>((a) =>
    a.kind === "text"
      ? { kind: "text", name: a.name, content: (a as AttachmentMeta & { content?: string }).content ?? "" }
      : { kind: a.kind, fileId: a.fileId, name: a.name, size: a.size },
  );

  const ac = streamControllers.get(sid) ?? new AbortController();
  streamControllers.set(sid, ac);

  try {
    await api.streamMessage(
      anthropicSessionId,
      { text: trimmed, attachments: apiAttachments, environmentId },
      {
        signal: ac.signal,
        onEvent: (ev) => {
          set((st) => {
            const cs = st.streaming;
            if (!cs || cs.sessionId !== sid) return st;
            switch (ev.type) {
              case "message_start":
                return { streaming: { ...cs, messageId: ev.id || cs.messageId } };
              case "text_delta":
                return { streaming: { ...cs, text: cs.text + ev.delta } };
              case "activity":
                return {
                  streaming: {
                    ...cs,
                    activity: [
                      ...cs.activity,
                      {
                        id: nanoid(6),
                        kind: ev.kind,
                        label: ev.label,
                        summary: ev.summary,
                        at: Date.now(),
                      },
                    ],
                  },
                };
              case "message_end": {
                // Commit assembled assistant message.
                const sessNow = st.sessions[sid];
                if (!sessNow) return { streaming: null };
                const reply: ChatMessage = {
                  id: cs.messageId,
                  role: "assistant",
                  content: cs.text,
                  createdAt: Date.now(),
                };
                const nextPending = { ...st.pendingSessionIds };
                delete nextPending[sid];
                return {
                  streaming: null,
                  pendingSessionIds: nextPending,
                  sessions: {
                    ...st.sessions,
                    [sid]: {
                      ...sessNow,
                      messages: [...sessNow.messages, reply],
                      updatedAt: reply.createdAt,
                    },
                  },
                };
              }
              case "error":
                return {
                  streaming: { ...cs, status: "error", errorMessage: ev.message },
                };
              default:
                return st;
            }
          });
        },
      },
    );
  } catch (err) {
    set((st) => {
      const cs = st.streaming;
      if (!cs || cs.sessionId !== sid) return st;
      // If user cancelled, keep partial; otherwise mark error.
      if (cs.status === "cancelled") return st;
      return {
        streaming: {
          ...cs,
          status: "error",
          errorMessage: err instanceof Error ? err.message : "stream_failed",
        },
      };
    });
  } finally {
    streamControllers.delete(sid);
    set((st) => {
      if (!st.pendingSessionIds[sid]) return st;
      const nextPending = { ...st.pendingSessionIds };
      delete nextPending[sid];
      return { pendingSessionIds: nextPending };
    });
  }
},
```

- [ ] **Step 3: Add `cancelStreaming` and `retryLastTurn`**

Add a module-level map for AbortControllers (above `createAssistantStore`):

```ts
const streamControllers = new Map<string, AbortController>();
```

Inside the store actions, alongside `sendMessage`:

```ts
cancelStreaming: () => {
  const sid = get().selectedSessionId;
  if (!sid) return;
  const ac = streamControllers.get(sid);
  if (ac) ac.abort();
  set((st) => {
    const cs = st.streaming;
    if (!cs || cs.sessionId !== sid) return st;
    // Commit partial text as final assistant message; clear streaming.
    if (cs.text.length > 0) {
      const sessNow = st.sessions[sid];
      if (!sessNow) return { streaming: null };
      return {
        streaming: null,
        sessions: {
          ...st.sessions,
          [sid]: {
            ...sessNow,
            messages: [
              ...sessNow.messages,
              {
                id: cs.messageId,
                role: "assistant",
                content: cs.text,
                createdAt: Date.now(),
              },
            ],
            updatedAt: Date.now(),
          },
        },
      };
    }
    return { streaming: null };
  });
  // Best-effort BE cancel.
  const aSid = get().sessions[sid]?.anthropicSessionId;
  if (aSid) void api.cancel(aSid);
},

retryLastTurn: async () => {
  const sid = get().selectedSessionId;
  if (!sid) return;
  const sess = get().sessions[sid];
  if (!sess) return;
  // Continuation prompt: resend a generic "please continue" rather than re-sending the user's prior turn.
  // This avoids double-sending the original user message into the Anthropic session.
  set({ streaming: null });
  await get().sendMessage("Please continue.");
},
```

- [ ] **Step 4: Update existing tests for the API change**

The existing `sendMessage` tests rely on the timer-based mock. Replace them with versions that mock the API.

Edit `apps/fe/src/stores/assistant.test.ts`. Add at the top:

```ts
import { vi } from "vite-plus/test";

vi.mock("#/lib/assistant-api", () => {
  return {
    createSession: vi.fn(async () => ({ sessionId: "asid", environmentId: "eid" })),
    uploadFile: vi.fn(),
    streamMessage: vi.fn(
      async (
        _sid: string,
        _body: unknown,
        opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
      ) => {
        opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
        opts.onEvent({ type: "text_delta", delta: "ok" });
        opts.onEvent({ type: "message_end" });
      },
    ),
    cancel: vi.fn(),
  };
});
```

Replace any timer-based test with the new flow. Add tests covering:

```ts
test("sendMessage creates Anthropic session lazily on first send", async () => {
  const s = createAssistantStore();
  const id = s.getState().createSession();
  await s.getState().sendMessage("hi");
  expect(s.getState().sessions[id]?.anthropicSessionId).toBe("asid");
  expect(s.getState().sessions[id]?.environmentId).toBe("eid");
});

test("text_delta accumulates into streaming.text and message_end commits to messages", async () => {
  const s = createAssistantStore();
  s.getState().createSession();
  await s.getState().sendMessage("hi");
  const sid = s.getState().selectedSessionId!;
  const msgs = s.getState().sessions[sid]!.messages;
  expect(msgs.at(-1)).toMatchObject({ role: "assistant", content: "ok" });
  expect(s.getState().streaming).toBeNull();
});

test("error event sets streaming.status=error", async () => {
  const api = await import("#/lib/assistant-api");
  (api.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async (_sid: string, _body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
      opts.onEvent({ type: "error", message: "boom", retryable: true });
    },
  );
  const s = createAssistantStore();
  s.getState().createSession();
  await s.getState().sendMessage("hi");
  expect(s.getState().streaming?.status).toBe("error");
});

test("cancelStreaming keeps partial text as committed assistant message", async () => {
  const api = await import("#/lib/assistant-api");
  let resolveStream!: () => void;
  (api.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async (
      _sid: string,
      _body: unknown,
      opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
    ) => {
      opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
      opts.onEvent({ type: "text_delta", delta: "partial" });
      // Hang until cancelled.
      await new Promise<void>((resolve) => {
        resolveStream = resolve;
        opts.signal?.addEventListener("abort", () => resolve());
      });
    },
  );
  const s = createAssistantStore();
  const id = s.getState().createSession();
  const p = s.getState().sendMessage("hi");
  // Allow the stream mock to enqueue.
  await new Promise<void>((r) => setTimeout(r, 0));
  s.getState().cancelStreaming();
  await p;
  const last = s.getState().sessions[id]!.messages.at(-1)!;
  expect(last.role).toBe("assistant");
  expect(last.content).toBe("partial");
  expect(s.getState().streaming).toBeNull();
  resolveStream();
});

test("create-session failure sets streaming.error without adding messages", async () => {
  const api = await import("#/lib/assistant-api");
  (api.createSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network_down"));
  const s = createAssistantStore();
  const id = s.getState().createSession();
  await s.getState().sendMessage("hi");
  expect(s.getState().sessions[id]!.messages).toHaveLength(0);
  expect(s.getState().streaming?.status).toBe("error");
  expect(s.getState().streaming?.errorMessage).toContain("network_down");
});
```

Remove or rewrite any pre-existing tests that asserted on `setTimeout` reply behavior — those don't apply anymore.

- [ ] **Step 5: Run, verify pass**

```bash
vp run fe#test src/stores/assistant.test.ts
```

Expected: all tests pass. The total count will differ from 18 because the timer-based tests were replaced.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/stores/assistant.ts apps/fe/src/stores/assistant.test.ts
git commit -m "feat(fe): replace mock with streaming agent path in assistant store"
```

---

## Task 12: FE — markdown renderer

**Files:**

- Create: `apps/fe/src/components/assistant/markdown.tsx`
- Create: `apps/fe/src/components/assistant/markdown.test.tsx`

- [ ] **Step 1: Write the failing test**

````tsx
// apps/fe/src/components/assistant/markdown.test.tsx
import { describe, expect, test } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  test("renders inline code", () => {
    render(<Markdown source="use `foo()` here" />);
    expect(screen.getByText("foo()").tagName).toBe("CODE");
  });

  test("renders fenced code block with copy button", () => {
    render(<Markdown source={"```ts\nlet x=1;\n```"} />);
    expect(screen.getByText(/let x=1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  test("renders link with safe target+rel", () => {
    render(<Markdown source="[a](https://example.com)" />);
    const a = screen.getByRole("link") as HTMLAnchorElement;
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
  });
});
````

- [ ] **Step 2: Run, verify failure**

```bash
vp run fe#test src/components/assistant/markdown.test.tsx
```

Expected: fail.

- [ ] **Step 3: Implement**

```tsx
// apps/fe/src/components/assistant/markdown.tsx
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "#/lib/utils";

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const text = typeof children === "string" ? children : String(children ?? "");
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="relative my-2 overflow-hidden rounded border border-(--rule) bg-(--paper-soft)">
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded text-(--ink-faint) hover:bg-(--paper) hover:text-(--ink)"
        onClick={onCopy}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre className={cn("overflow-x-auto p-3 text-[12.5px] leading-relaxed", className)}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-assistant text-[13px] leading-relaxed text-(--ink)">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--ink) underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code({ inline, className, children }) {
            if (inline) {
              return (
                <code className="rounded bg-(--paper-soft) px-1 py-0.5 font-mono text-[12px]">
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
```

NOTE: `react-markdown` v9 uses `code({ inline })`. If the installed version differs, adapt to its `components` API — the rest of this component does not change.

- [ ] **Step 4: Run, verify pass**

```bash
vp run fe#test src/components/assistant/markdown.test.tsx
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/assistant/markdown.tsx apps/fe/src/components/assistant/markdown.test.tsx
git commit -m "feat(fe): markdown renderer with code-block copy"
```

---

## Task 13: FE — attachment chip + row

**Files:**

- Create: `apps/fe/src/components/assistant/attachment-chip.tsx`
- Create: `apps/fe/src/components/assistant/attachment-row.tsx`
- Create: `apps/fe/src/components/assistant/attachment-row.test.tsx`

The composer keeps a per-message draft that is the input to `sendMessage`. The draft has the shape:

```ts
type DraftAttachment = {
  id: string;
  // For images / pdfs: a File (until uploaded) and a fileId (after upload).
  // For text: the read text content.
  file?: File;
  kind: "image" | "pdf" | "text";
  name: string;
  size: number;
  fileId?: string;
  content?: string; // only for text
  status: "uploading" | "ready" | "error";
  error?: string;
};
```

This shape lives entirely in the composer; the store only sees the final `AttachmentMeta` (with text content piggy-backed for the "text" kind, see Task 11 step 2).

- [ ] **Step 1: Implement `attachment-chip.tsx`**

```tsx
// apps/fe/src/components/assistant/attachment-chip.tsx
import { FileText, Image as ImageIcon, RotateCw, X } from "lucide-react";
import { cn } from "#/lib/utils";

export type DraftAttachment = {
  id: string;
  file?: File;
  kind: "image" | "pdf" | "text";
  name: string;
  size: number;
  fileId?: string;
  content?: string;
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChip({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: DraftAttachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const failed = attachment.status === "error";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded border bg-(--paper) px-2 py-1 text-[12px]",
        failed ? "border-red-400" : "border-(--rule)",
      )}
    >
      {attachment.kind === "image" && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="size-7 rounded object-cover"
        />
      ) : attachment.kind === "image" ? (
        <ImageIcon className="size-4 text-(--ink-faint)" />
      ) : (
        <FileText className="size-4 text-(--ink-faint)" />
      )}
      <div className="flex flex-col">
        <span className="max-w-40 truncate text-(--ink)">{attachment.name}</span>
        <span className="text-(--ink-faint)">
          {attachment.status === "uploading"
            ? "Uploading…"
            : failed
              ? "Failed"
              : formatSize(attachment.size)}
        </span>
      </div>
      {failed && (
        <button
          type="button"
          aria-label="Retry upload"
          className="text-(--ink-faint) hover:text-(--ink)"
          onClick={onRetry}
        >
          <RotateCw className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label={`Remove ${attachment.name}`}
        className="text-(--ink-faint) hover:text-(--ink)"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Implement `attachment-row.tsx`**

```tsx
// apps/fe/src/components/assistant/attachment-row.tsx
import { Plus } from "lucide-react";
import { useRef } from "react";
import { nanoid } from "nanoid";
import { uploadFile } from "#/lib/assistant-api";
import { AttachmentChip, type DraftAttachment } from "./attachment-chip";

const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  ".md",
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".log",
  ".py",
  ".sh",
].join(",");

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function classifyFile(file: File): DraftAttachment["kind"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  // Treat anything else with a non-binary text-ish extension as text. Reject if size > 1MB.
  if (file.size <= 1024 * 1024) return "text";
  return null;
}

export function AttachmentRow({
  attachments,
  setAttachments,
}: {
  attachments: DraftAttachment[];
  setAttachments: (
    next: DraftAttachment[] | ((prev: DraftAttachment[]) => DraftAttachment[]),
  ) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  const add = async (files: FileList | null) => {
    if (!files) return;
    const accepted: DraftAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) continue;
      const kind = classifyFile(file);
      if (!kind) continue;
      const id = nanoid(6);
      const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined;
      accepted.push({
        id,
        file,
        kind,
        name: file.name,
        size: file.size,
        previewUrl,
        status: kind === "text" ? "ready" : "uploading",
      });
    }
    if (accepted.length === 0) return;
    setAttachments((prev) => [...prev, ...accepted]);

    for (const a of accepted) {
      if (a.kind === "text") {
        try {
          const content = await a.file!.text();
          setAttachments((prev) =>
            prev.map((p) => (p.id === a.id ? { ...p, content, status: "ready" } : p)),
          );
        } catch (err) {
          setAttachments((prev) =>
            prev.map((p) =>
              p.id === a.id
                ? {
                    ...p,
                    status: "error",
                    error: err instanceof Error ? err.message : "read_failed",
                  }
                : p,
            ),
          );
        }
      } else {
        try {
          const r = await uploadFile(a.file!);
          setAttachments((prev) =>
            prev.map((p) => (p.id === a.id ? { ...p, fileId: r.fileId, status: "ready" } : p)),
          );
        } catch (err) {
          setAttachments((prev) =>
            prev.map((p) =>
              p.id === a.id
                ? {
                    ...p,
                    status: "error",
                    error: err instanceof Error ? err.message : "upload_failed",
                  }
                : p,
            ),
          );
        }
      }
    }
  };

  const remove = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const retry = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target?.file) return prev;
      void add(toFileList(target.file));
      return prev.filter((p) => p.id !== id);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
      {attachments.map((a) => (
        <AttachmentChip
          key={a.id}
          attachment={a}
          onRemove={() => remove(a.id)}
          onRetry={() => retry(a.id)}
        />
      ))}
      <button
        type="button"
        aria-label="Add attachment"
        className="inline-flex h-7 items-center gap-1 rounded border border-(--rule) bg-(--paper) px-2 text-[12px] text-(--ink-faint) hover:text-(--ink)"
        onClick={() => ref.current?.click()}
      >
        <Plus className="size-3.5" />
        Attach
      </button>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function toFileList(file: File): FileList {
  const dt = new DataTransfer();
  dt.items.add(file);
  return dt.files;
}
```

- [ ] **Step 3: Test happy path + error path**

```tsx
// apps/fe/src/components/assistant/attachment-row.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentRow } from "./attachment-row";
import type { DraftAttachment } from "./attachment-chip";

vi.mock("#/lib/assistant-api", () => ({
  uploadFile: vi.fn(),
}));

function Harness() {
  const [a, setA] = useState<DraftAttachment[]>([]);
  return (
    <div>
      <AttachmentRow attachments={a} setAttachments={setA} />
      <div data-testid="count">{a.length}</div>
      <div data-testid="status">{a.map((x) => x.status).join(",")}</div>
    </div>
  );
}

describe("AttachmentRow", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  test("uploads an image and marks chip ready", async () => {
    const api = await import("#/lib/assistant-api");
    (api.uploadFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      fileId: "f1",
      kind: "image",
      name: "x.png",
      size: 4,
    });
    render(<Harness />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  });

  test("marks chip error on upload failure and shows retry button", async () => {
    const api = await import("#/lib/assistant-api");
    (api.uploadFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    render(<Harness />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect(screen.getByRole("button", { name: /retry upload/i })).toBeTruthy();
  });

  test("text file is read inline and marked ready", async () => {
    render(<Harness />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["hello"], "n.txt", { type: "text/plain" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  });
});
```

- [ ] **Step 4: Run, verify pass**

```bash
vp run fe#test src/components/assistant/attachment-row.test.tsx
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/assistant/attachment-chip.tsx apps/fe/src/components/assistant/attachment-row.tsx apps/fe/src/components/assistant/attachment-row.test.tsx
git commit -m "feat(fe): per-message attachment chips + row with upload"
```

---

## Task 14: FE — activity strip

**Files:**

- Create: `apps/fe/src/components/assistant/activity-strip.tsx`
- Create: `apps/fe/src/components/assistant/activity-strip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/fe/src/components/assistant/activity-strip.test.tsx
import { describe, expect, test } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityStrip } from "./activity-strip";

const items = [
  { id: "a1", kind: "thinking" as const, label: "Thinking…", at: 1 },
  { id: "a2", kind: "tool_use" as const, label: "Searched the web", at: 2 },
];

describe("ActivityStrip", () => {
  test("collapsed shows only latest label", () => {
    render(<ActivityStrip items={items} />);
    expect(screen.getByText("Searched the web")).toBeTruthy();
    expect(screen.queryByText("Thinking…")).toBeNull();
  });

  test("expands on click", async () => {
    render(<ActivityStrip items={items} />);
    await userEvent.click(screen.getByRole("button", { name: /show steps/i }));
    expect(screen.getByText("Thinking…")).toBeTruthy();
  });

  test("renders nothing when empty", () => {
    const { container } = render(<ActivityStrip items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
vp run fe#test src/components/assistant/activity-strip.test.tsx
```

Expected: fail.

- [ ] **Step 3: Implement**

```tsx
// apps/fe/src/components/assistant/activity-strip.tsx
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import type { StreamingActivity } from "#/stores/assistant";

export function ActivityStrip({ items }: { items: StreamingActivity[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const latest = items[items.length - 1]!;
  return (
    <div className="mb-1 rounded border border-(--rule) bg-(--paper-soft) text-[12px]">
      <button
        type="button"
        aria-label={open ? "Hide steps" : "Show steps"}
        className="flex w-full items-center gap-2 px-2 py-1 text-left text-(--ink-faint) hover:text-(--ink)"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Sparkles className="size-3.5" />
        <span className="truncate">{latest.label}</span>
        {items.length > 1 && (
          <span className="ml-auto text-(--ink-faint)">{items.length} steps</span>
        )}
      </button>
      {open && (
        <ul className="border-t border-(--rule) px-2 py-1">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 py-0.5 text-(--ink)">
              <span className="text-(--ink-faint)">{it.kind}</span>
              <span>{it.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

```bash
vp run fe#test src/components/assistant/activity-strip.test.tsx
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/assistant/activity-strip.tsx apps/fe/src/components/assistant/activity-strip.test.tsx
git commit -m "feat(fe): collapsible activity strip for streaming bubble"
```

---

## Task 15: FE — composer with attachments + stop button

The composer's signature changes from `onSend(text)` to `onSend(text, attachments)`, and it accepts a `streaming: boolean` prop that flips the send button to a stop button. Cancel is plumbed via `onStop`.

**Files:**

- Modify: `apps/fe/src/components/assistant/composer.tsx`

- [ ] **Step 1: Implement the new composer**

Replace the file contents with:

```tsx
// apps/fe/src/components/assistant/composer.tsx
import { ArrowUp, Square } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "#/lib/utils";
import type { AttachmentMeta } from "#/stores/assistant";
import { AttachmentRow } from "./attachment-row";
import type { DraftAttachment } from "./attachment-chip";

export function Composer({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string, attachments: AttachmentMeta[]) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 6 * 20;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  const anyUploading = attachments.some((a) => a.status === "uploading");
  const anyError = attachments.some((a) => a.status === "error");
  const canSend =
    !disabled &&
    !streaming &&
    !anyUploading &&
    !anyError &&
    (value.trim().length > 0 || attachments.length > 0);

  const submit = () => {
    if (!canSend) return;
    const meta: AttachmentMeta[] = attachments.map((a) =>
      a.kind === "text"
        ? ({
            kind: "text",
            name: a.name,
            size: a.size,
            content: a.content ?? "",
          } as unknown as AttachmentMeta) // see note in store: text kind carries content
        : { kind: a.kind, fileId: a.fileId!, name: a.name, size: a.size },
    );
    onSend(value, meta);
    setValue("");
    // Revoke any image preview URLs we created.
    for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    setAttachments([]);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="border-t border-(--rule) pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {(attachments.length > 0 || streaming) && (
        <AttachmentRow attachments={attachments} setAttachments={setAttachments} />
      )}
      <div className="px-3 pt-2">
        <div className="relative flex items-end gap-2 rounded-md border border-(--rule) bg-(--paper) px-3 py-2 focus-within:border-(--rule-strong)">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything…"
            aria-label="Message"
            className="max-h-30 min-h-[20px] flex-1 resize-none bg-transparent text-[13px] text-(--ink) placeholder:text-(--ink-faint) focus:outline-none"
          />
          {streaming ? (
            <button
              type="button"
              aria-label="Stop response"
              onClick={onStop}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded bg-(--ink) text-(--paper) hover:opacity-90"
            >
              <Square className="size-3" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded transition",
                canSend
                  ? "bg-(--ink) text-(--paper) hover:opacity-90"
                  : "bg-(--paper-soft) text-(--ink-faint)",
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>
          )}
        </div>
        {attachments.length === 0 && !streaming && (
          <div className="px-1 pt-1 text-right">
            <button
              type="button"
              className="text-[11px] text-(--ink-faint) hover:text-(--ink)"
              onClick={() => {
                // Trigger the hidden file input by mounting the row.
                setAttachments([]);
              }}
            />
          </div>
        )}
      </div>
    </form>
  );
}
```

NOTE on the `AttachmentMeta` cast: the store's `AttachmentMeta` type does not include the `content` field for the `text` kind because content is forwarded directly to the API and is not persisted. The composer piggybacks `content` on the object handed to `sendMessage`; the store's `sendMessage` reads it (Task 11 step 2) and the persisted message only retains `{kind, name, size}`. This avoids storing pasted file bodies in localStorage.

The bottom "Trigger hidden file input" stub is a placeholder — render `<AttachmentRow />` unconditionally above the textarea instead. Update the JSX:

Replace the `{(attachments.length > 0 || streaming) && (...)}` line with always-rendering the row when not streaming:

```tsx
{
  !streaming && <AttachmentRow attachments={attachments} setAttachments={setAttachments} />;
}
```

…and remove the dangling "Trigger hidden file input" block at the bottom.

- [ ] **Step 2: Update consumers — `assistant-panel.tsx`**

Open `apps/fe/src/components/assistant/assistant-panel.tsx`. Where it currently renders `<Composer disabled={...} onSend={(t) => sendMessage(t)} />`, change to:

```tsx
<Composer
  disabled={!selectedSessionId}
  streaming={streaming?.sessionId === selectedSessionId && streaming?.status === "streaming"}
  onSend={(text, attachments) => void sendMessage(text, attachments)}
  onStop={cancelStreaming}
/>
```

Pull `streaming` and `cancelStreaming` from the store via `useAssistant`. Update existing assistant-panel tests that called `onSend("hi")` to pass the second arg `[]`.

- [ ] **Step 3: Run existing assistant-panel tests**

```bash
vp run fe#test src/components/assistant
```

Expected: all assistant tests pass. Adjust any test that depended on the old `onSend(text)` signature (pass `[]` for attachments).

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/assistant/composer.tsx apps/fe/src/components/assistant/assistant-panel.tsx apps/fe/src/components/assistant/assistant-panel.test.tsx
git commit -m "feat(fe): composer with attachment row + stop-while-streaming"
```

---

## Task 16: FE — message bubble + message list (markdown, chips, streaming bubble)

**Files:**

- Modify: `apps/fe/src/components/assistant/message-bubble.tsx`
- Modify: `apps/fe/src/components/assistant/message-list.tsx`
- Modify: `apps/fe/src/components/assistant/assistant-panel.tsx`

- [ ] **Step 1: Update `message-bubble.tsx`**

The bubble now distinguishes role:

- assistant: render markdown
- user: render plain text + attachment chips beneath

Replace the file contents (preserving the existing className skeleton) with:

```tsx
// apps/fe/src/components/assistant/message-bubble.tsx
import { FileText, Image as ImageIcon } from "lucide-react";
import type { AttachmentMeta, ChatMessage } from "#/stores/assistant";
import { cn } from "#/lib/utils";
import { Markdown } from "./markdown";

function AttachmentList({ items }: { items: AttachmentMeta[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((a, i) => (
        <span
          key={`${a.name}-${i}`}
          className="inline-flex items-center gap-1 rounded border border-(--rule) bg-(--paper) px-1.5 py-0.5 text-[11px] text-(--ink-faint)"
        >
          {a.kind === "image" ? <ImageIcon className="size-3" /> : <FileText className="size-3" />}
          <span className="max-w-32 truncate">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-md px-3 py-2 text-[13px] leading-relaxed",
          isUser ? "bg-(--paper-soft) text-(--ink)" : "text-(--ink)",
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <Markdown source={message.content} />
        )}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <AttachmentList items={message.attachments} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `message-list.tsx` to render the streaming bubble**

The list should render:

1. All committed `messages[]`.
2. If `streaming.sessionId === currentSession.id`, an in-progress assistant bubble showing:
   - Activity strip on top.
   - Streaming markdown text in the bubble body.
   - If `streaming.status === "error"`, an inline error caption + Retry button.

Modify the existing list. Add a new prop / hook to read the streaming slot:

```tsx
// apps/fe/src/components/assistant/message-list.tsx
import { useEffect, useRef } from "react";
import { useAssistant, type ChatSession } from "#/stores/assistant";
import { MessageBubble } from "./message-bubble";
import { Markdown } from "./markdown";
import { ActivityStrip } from "./activity-strip";

export function MessageList({ session }: { session: ChatSession }) {
  const streaming = useAssistant((s) => s.streaming);
  const retry = useAssistant((s) => s.retryLastTurn);
  const ref = useRef<HTMLDivElement | null>(null);

  const isStreamingHere = streaming?.sessionId === session.id;

  // Auto-scroll on new content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [
    session.messages.length,
    isStreamingHere ? streaming?.text : "",
    isStreamingHere ? streaming?.activity.length : 0,
  ]);

  if (session.messages.length === 0 && !isStreamingHere) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-(--ink-faint)">
        Start a conversation
      </div>
    );
  }

  return (
    <div ref={ref} className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-3">
      {session.messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {isStreamingHere && (
        <div className="flex w-full justify-start">
          <div className="max-w-[88%] text-[13px] leading-relaxed text-(--ink)">
            <ActivityStrip items={streaming!.activity} />
            <Markdown source={streaming!.text} />
            {streaming!.status === "error" && (
              <div className="mt-1 flex items-center gap-2 text-[12px] text-(--ink-faint)">
                <span>(reply was interrupted)</span>
                <button
                  type="button"
                  className="rounded border border-(--rule) px-2 py-0.5 hover:bg-(--paper-soft)"
                  onClick={() => void retry()}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

Remove the existing typing-indicator pathway (`pendingSessionIds` is still used by other code paths, but the streaming bubble replaces the visual indicator). If the message-list previously showed a "three-dot typing" indicator gated by `pendingSessionIds`, remove that block — the activity strip + empty streaming bubble replaces it.

- [ ] **Step 3: Update `assistant-panel.tsx`**

The panel should not need to thread the streaming slot anywhere except through the composer. Confirm it pulls `streaming` and `cancelStreaming` from `useAssistant` (added in Task 15) and the message-list reads `streaming` itself.

If the previous panel rendered a typing-indicator block, remove it.

- [ ] **Step 4: Update existing tests**

The existing `message-list` / `assistant-panel` tests will need updates:

- "Start a conversation" empty state still applies but only when no streaming bubble.
- The "typing indicator" test (if any) is replaced by a streaming-bubble test.

Add these new tests to `apps/fe/src/components/assistant/assistant-panel.test.tsx`:

```tsx
test("renders streaming bubble with text and activity strip", async () => {
  const api = await import("#/lib/assistant-api");
  let onEv!: (e: unknown) => void;
  (api.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async (_sid: string, _body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      onEv = opts.onEvent;
      onEv({ type: "message_start", id: "m1", createdAt: 1 });
      onEv({ type: "activity", kind: "thinking", label: "Thinking…" });
      onEv({ type: "text_delta", delta: "ok" });
      // hold without ending
      await new Promise(() => {});
    },
  );
  render(<AssistantPanel />);
  await userEvent.type(screen.getByLabelText("Message"), "hi{Enter}");
  await waitFor(() => expect(screen.getByText("ok")).toBeTruthy());
  expect(screen.getByText("Thinking…")).toBeTruthy();
});

test("stop button replaces send while streaming", async () => {
  const api = await import("#/lib/assistant-api");
  (api.streamMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async (
      _sid: string,
      _body: unknown,
      opts: { onEvent: (e: unknown) => void; signal?: AbortSignal },
    ) => {
      opts.onEvent({ type: "message_start", id: "m1", createdAt: 1 });
      opts.onEvent({ type: "text_delta", delta: "partial" });
      await new Promise<void>((resolve) => opts.signal?.addEventListener("abort", () => resolve()));
    },
  );
  render(<AssistantPanel />);
  await userEvent.type(screen.getByLabelText("Message"), "hi{Enter}");
  await waitFor(() => expect(screen.getByRole("button", { name: /stop response/i })).toBeTruthy());
  await userEvent.click(screen.getByRole("button", { name: /stop response/i }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /stop response/i })).toBeNull());
  expect(screen.getByText("partial")).toBeTruthy();
});
```

Mock setup at the top of the test file (matches Task 11):

```tsx
vi.mock("#/lib/assistant-api", () => ({
  createSession: vi.fn(async () => ({ sessionId: "asid", environmentId: "eid" })),
  uploadFile: vi.fn(),
  streamMessage: vi.fn(),
  cancel: vi.fn(),
}));
```

- [ ] **Step 5: Run, verify**

```bash
vp run fe#test src/components/assistant
```

Expected: all assistant tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/components/assistant/message-bubble.tsx apps/fe/src/components/assistant/message-list.tsx apps/fe/src/components/assistant/assistant-panel.tsx apps/fe/src/components/assistant/assistant-panel.test.tsx
git commit -m "feat(fe): markdown bubble, attachment chips, streaming render"
```

---

## Task 17: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check + format + lint**

```bash
vp check
```

Expected: clean, except for the pre-existing `apps/fe/src/routeTree.gen.ts` formatting note (pre-existed our work; do not modify the generated file).

- [ ] **Step 2: Full test suite**

```bash
vp run test -r
```

Expected: all FE + utils tests pass.

- [ ] **Step 3: Manual end-to-end smoke**

In two terminals:

```bash
# terminal 1
vp run be#dev
# terminal 2
vp run fe#dev
```

Open http://localhost:3000. Walk through:

1. Open the assistant (Ctrl+/) → send `hi` → user bubble appears immediately → activity strip shows working state → assistant text streams in → activity collapses on completion. ✅
2. Attach 1 image + 1 PDF + 1 `.ts` file → send `Summarize each attachment.` → all three reach the agent (verified by the agent's reply mentioning each). ✅
3. Send a long prompt → click stop mid-stream → partial text retained, no error row. ✅
4. Throttle network to "Slow 3G" → send → mid-stream drop → "(reply was interrupted)" + Retry → completes after retry. ✅
5. Reload page mid-stream → partial text persists; new sends in the same session continue working. ✅
6. Send in session A, switch to session B during stream, return to A — reply landed in A. ✅

- [ ] **Step 4: Commit if any verification follow-ups landed**

If steps 1-3 surfaced last-mile fixes, commit them:

```bash
git add -A
git commit -m "fix(fe): smoke-test follow-ups for assistant streaming"
```

If nothing changed, no commit is needed.

---

## Self-review notes (for plan author)

**Spec coverage:**

- Decision A (FE source of truth) — Tasks 10-11 keep messages in localStorage; BE adds no D1.
- Streaming SSE — Tasks 5, 8, 11.
- Per-message attachments (image/pdf/text) — Tasks 4, 13, 15.
- Activity strip — Tasks 5 (BE side), 14, 16 (render).
- Stop button — Tasks 11 (cancelStreaming), 15.
- Lazy Anthropic-session bootstrap — Task 11 step 2.
- Wire format normalization — Task 5.
- Markdown rendering — Task 12, 16.
- Forward path to B (D1) — covered by spec; no plan tasks needed (designed for migration, not pre-implemented).

**Type consistency:**

- `Attachment` (API) and `AttachmentMeta` (store) intentionally diverge: API carries `content` on text kind, store does not (text content is forwarded once and dropped). Store's persisted shape excludes `content` to keep localStorage small.
- `WireEvent` is identical on BE (Task 5) and FE (Task 9).
- `StreamingActivity` exported from `stores/assistant.ts` and consumed by `activity-strip.tsx`.

**Placeholder scan:** No TBDs. Two NOTEs flag SDK-version-dependent details (managed-agents beta header, `react-markdown` v9 components shape) where the integrator may need to adapt one constant or one prop name.
