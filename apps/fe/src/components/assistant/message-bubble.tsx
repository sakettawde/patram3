import { FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "#/lib/utils";
import type { AttachmentMeta, ChatMessage } from "#/stores/assistant";
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
