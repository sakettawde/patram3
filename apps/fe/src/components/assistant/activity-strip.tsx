import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import type { StreamingActivity } from "#/stores/assistant";

export function ActivityStrip({ items }: { items: StreamingActivity[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const latest = items[items.length - 1]!;
  return (
    <div className="mb-1 rounded border border-(--rule) bg-(--paper-soft) text-[12px]">
      <button
        type="button"
        aria-label={open ? "Hide steps" : "Show steps"}
        className="flex w-full items-center gap-2 px-2 py-1 text-left text-(--ink-faint) hover:text-(--ink)"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Sparkles className="size-3.5" />
        <span className="truncate">{latest.label}</span>
        {items.length > 1 && (
          <span className="ml-auto text-(--ink-faint)">{items.length} steps</span>
        )}
      </button>
      {open && (
        <ul className="border-t border-(--rule) px-2 py-1">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 py-0.5 text-(--ink)">
              <span className="text-(--ink-faint)">{it.kind}</span>
              <span>{it.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
