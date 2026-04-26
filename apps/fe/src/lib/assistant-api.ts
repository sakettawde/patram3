import { readSSE } from "./sse";

const BASE = (import.meta.env.VITE_BE_URL ?? "http://localhost:8787") + "/assistant";

export type Attachment =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; content: string };

export type SendBody = {
  text: string;
  attachments: Attachment[];
  environmentId: string;
  documentId: string; // Task 8: sessions are bound to a document; Task 9 will plumb this into the network request
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
  | {
      type: "proposal";
      id: string;
      kind: "replace" | "insert_after" | "delete";
      blockId: string;
      afterBlockId?: string;
      content?: string;
      toolUseId: string;
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

export async function createSession(userId: string): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: { "X-User-Id": userId },
  });
  return jsonOrThrow(res);
}

export async function uploadFile(userId: string, file: File): Promise<UploadFileResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/files`, {
    method: "POST",
    headers: { "X-User-Id": userId },
    body: fd,
  });
  return jsonOrThrow(res);
}

export async function streamMessage(
  userId: string,
  sessionId: string,
  body: SendBody,
  opts: { onEvent: (e: WireEvent) => void; signal?: AbortSignal },
): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-User-Id": userId },
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

export async function cancel(userId: string, sessionId: string): Promise<void> {
  await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: "POST",
    headers: { "X-User-Id": userId },
  }).catch(() => {});
}
