import { ArrowUp } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "#/lib/utils";

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // auto-grow up to ~6 lines
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 6 * 20;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  const canSend = !disabled && value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue("");
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
      className="border-t border-(--rule) p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
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
      </div>
    </form>
  );
}
