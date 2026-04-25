import { useEffect, useRef } from "react";
import type { ChatMessage } from "#/stores/assistant";
import { MessageBubble } from "./message-bubble";

export function MessageList({
  sessionId,
  messages,
  pending,
}: {
  sessionId: string;
  messages: ChatMessage[];
  pending: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll on new messages, on pending change, and on session switch
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, sessionId]);

  if (messages.length === 0 && !pending) {
    return (
      <div
        ref={scrollRef}
        className="flex flex-1 items-center justify-center text-[13px] text-(--ink-faint)"
      >
        Start a conversation
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} role={m.role} content={m.content} />
      ))}
      {pending && (
        <div className="flex w-full justify-start" aria-label="Assistant is typing">
          <div className="rounded-md px-3 py-2 text-[13px] text-(--ink-faint)">
            <span className="inline-flex gap-1">
              <span className="size-1 animate-pulse rounded-full bg-current" />
              <span
                className="size-1 animate-pulse rounded-full bg-current"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="size-1 animate-pulse rounded-full bg-current"
                style={{ animationDelay: "240ms" }}
              />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
