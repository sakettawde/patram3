import { nanoid } from "nanoid";

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

const PROPOSE_NAMES = new Set([
  "propose_replace_block",
  "propose_insert_block_after",
  "propose_delete_block",
]);

export function isProposeName(name: string): boolean {
  return PROPOSE_NAMES.has(name);
}

// Translate SDK stream events to wire events. Event-type discriminators verified
// against BetaManagedAgentsStreamSessionEvents union in events.d.ts (SDK 0.91.1):
//
//   agent.message                 -> message_start + text_delta(s)
//   agent.thinking                -> activity { kind: "thinking" }
//   agent.tool_use                -> activity { kind: "tool_use", label: name }
//   agent.tool_result             -> activity { kind: "tool_result", label: ok|error }
//   agent.mcp_tool_use            -> activity { kind: "tool_use", label: server/name }
//   agent.mcp_tool_result         -> activity { kind: "tool_result" }
//   agent.custom_tool_use         -> proposal (for propose_* names) | activity { kind: "tool_use", label: name }
//   agent.thread_context_compacted-> activity { kind: "status", label: "compacted" }
//   span.model_request_end        -> activity { kind: "status" } w/ token usage summary
//   session.status_running        -> dropped (handled implicitly by message_start)
//   session.status_idle           -> message_end (CLOSES STREAM)
//   session.status_terminated     -> message_end (CLOSES STREAM)
//   session.status_rescheduled    -> activity { kind: "status", label: "rescheduled" }
//   session.deleted               -> message_end (CLOSES STREAM)
//   session.error                 -> error
//   span.model_request_start      -> dropped
//   user.* (echoes of the just-sent message) -> dropped
//
// Anything not in this list is dropped silently (we never forward raw SDK shapes).
export function translate(ev: unknown): WireEvent[] {
  if (!ev || typeof ev !== "object" || !("type" in ev)) return [];
  const e = ev as { type: string; [k: string]: unknown };

  switch (e.type) {
    case "agent.message": {
      const id = typeof e.id === "string" ? e.id : `msg_${Date.now()}`;
      const processedAt = typeof e.processed_at === "string" ? Date.parse(e.processed_at) : NaN;
      const createdAt = Number.isFinite(processedAt) ? processedAt : Date.now();
      const blocks = Array.isArray(e.content)
        ? (e.content as Array<{ type?: string; text?: string }>)
        : [];
      const text = blocks
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");

      const out: WireEvent[] = [{ type: "message_start", id, createdAt }];
      if (text.length > 0) out.push({ type: "text_delta", delta: text });
      return out;
    }

    case "agent.thinking":
      return [{ type: "activity", kind: "thinking", label: "Thinking" }];

    case "agent.tool_use": {
      const name = typeof e.name === "string" ? e.name : "tool";
      return [{ type: "activity", kind: "tool_use", label: name }];
    }

    case "agent.mcp_tool_use": {
      const server = typeof e.mcp_server_name === "string" ? e.mcp_server_name : "mcp";
      const name = typeof e.name === "string" ? e.name : "tool";
      return [{ type: "activity", kind: "tool_use", label: `${server}/${name}` }];
    }

    case "agent.custom_tool_use": {
      const name = typeof e.name === "string" ? e.name : "custom_tool";
      const toolUseId = typeof e.id === "string" ? e.id : `tu_${Date.now()}`;
      const input = (e.input ?? {}) as Record<string, unknown>;

      if (name === "propose_replace_block") {
        return [
          {
            type: "proposal",
            id: nanoid(8),
            kind: "replace",
            blockId: String(input.block_id ?? ""),
            content:
              typeof input.new_content_markdown === "string" ? input.new_content_markdown : "",
            toolUseId,
          },
        ];
      }
      if (name === "propose_insert_block_after") {
        const after = String(input.after_block_id ?? "");
        return [
          {
            type: "proposal",
            id: nanoid(8),
            kind: "insert_after",
            blockId: after,
            afterBlockId: after,
            content:
              typeof input.new_content_markdown === "string" ? input.new_content_markdown : "",
            toolUseId,
          },
        ];
      }
      if (name === "propose_delete_block") {
        return [
          {
            type: "proposal",
            id: nanoid(8),
            kind: "delete",
            blockId: String(input.block_id ?? ""),
            toolUseId,
          },
        ];
      }
      return [{ type: "activity", kind: "tool_use", label: name }];
    }

    case "agent.tool_result":
    case "agent.mcp_tool_result": {
      const isError = e.is_error === true;
      return [
        {
          type: "activity",
          kind: "tool_result",
          label: isError ? "error" : "ok",
        },
      ];
    }

    case "agent.thread_context_compacted":
      return [{ type: "activity", kind: "status", label: "Context compacted" }];

    case "session.status_rescheduled":
      return [{ type: "activity", kind: "status", label: "Rescheduled" }];

    case "span.model_request_end": {
      const usage = e.model_usage as
        | { input_tokens?: unknown; output_tokens?: unknown }
        | undefined;
      const summary =
        usage && typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number"
          ? `in=${usage.input_tokens} out=${usage.output_tokens}`
          : undefined;
      return [
        {
          type: "activity",
          kind: "status",
          label: "Model response",
          ...(summary ? { summary } : {}),
        },
      ];
    }

    case "session.status_idle": {
      // The session can go idle for three reasons:
      //   - end_turn         — the turn finished naturally; we close the stream.
      //   - retries_exhausted— same: nothing more is coming.
      //   - requires_action  — the agent is waiting for user input (e.g. an
      //                        unresolved custom_tool_use). The route handler
      //                        is responsible for sending the ack(s); we must
      //                        NOT emit message_end or the FE would close the
      //                        stream prematurely. Drop silently here and let
      //                        the route resume the agent.
      const stop = e.stop_reason as { type?: unknown } | undefined;
      if (stop && stop.type === "requires_action") return [];
      return [{ type: "message_end" }];
    }
    case "session.status_terminated":
    case "session.deleted":
      return [{ type: "message_end" }];

    case "session.error": {
      const err = e.error as { message?: unknown; retry_status?: { type?: unknown } } | undefined;
      const message = err && typeof err.message === "string" ? err.message : "session_error";
      const retryStatus =
        err && err.retry_status && typeof err.retry_status.type === "string"
          ? err.retry_status.type
          : "";
      const retryable = retryStatus === "retrying";
      return [{ type: "error", message, retryable }];
    }

    // Drop silently: status_running, span.model_request_start, user.* echoes,
    // and any future event types we don't yet recognize.
    default:
      return [];
  }
}
