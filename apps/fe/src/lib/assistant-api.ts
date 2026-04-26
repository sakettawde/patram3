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
