import { cn } from "#/lib/utils";
import type { ChatRole } from "#/stores/assistant";

export function MessageBubble({ role, content }: { role: ChatRole; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-md px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
          isUser ? "bg-(--paper-soft) text-(--ink)" : "text-(--ink)",
        )}
      >
        {content}
      </div>
    </div>
  );
}
