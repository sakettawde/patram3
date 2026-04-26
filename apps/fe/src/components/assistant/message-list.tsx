import { useEffect, useRef } from "react";
import { type ChatSession, useAssistant } from "#/stores/assistant";
import { ActivityStrip } from "./activity-strip";
import { Markdown } from "./markdown";
import { MessageBubble } from "./message-bubble";
import { ThinkingDots } from "./thinking-dots";

export function MessageList({ session }: { session: ChatSession }) {
  const streaming = useAssistant((s) => s.streaming);
  const retry = useAssistant((s) => s.retryLastTurn);
  const ref = useRef<HTMLDivElement | null>(null);

  const isStreamingHere = streaming?.sessionId === session.id;

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
            {streaming!.status === "streaming" &&
              streaming!.text === "" &&
              streaming!.activity.length === 0 && <ThinkingDots />}
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
