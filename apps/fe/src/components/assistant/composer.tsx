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

  // auto-grow up to ~6 lines (keep parity with the previous composer)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 6 * 20;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  // Revoke blob URLs on unmount.
  useEffect(() => {
    return () => {
      for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    };
    // intentionally not depending on `attachments` — only run on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Build the AttachmentMeta[] but piggy-back `content` on text-kind for the store to forward.
    // The store's sendMessage narrows at runtime. The meta type doesn't include `content`,
    // so we cast at the call site (the runtime field is harmless for non-text kinds).
    const meta = attachments.map((a) =>
      a.kind === "text"
        ? ({
            kind: "text" as const,
            name: a.name,
            size: a.size,
            content: a.content ?? "",
          } as AttachmentMeta & { content?: string })
        : ({
            kind: a.kind,
            fileId: a.fileId!,
            name: a.name,
            size: a.size,
          } as AttachmentMeta),
    );
    onSend(value, meta);
    setValue("");
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
      {!streaming && <AttachmentRow attachments={attachments} setAttachments={setAttachments} />}
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
            className="max-h-30 min-h-5 flex-1 resize-none bg-transparent text-[13px] text-(--ink) placeholder:text-(--ink-faint) focus:outline-none"
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
      </div>
    </form>
  );
}
