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
