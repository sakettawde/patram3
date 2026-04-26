import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SlashCommand } from "./slash-commands";

export type SlashMenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean };

type Props = {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
};

export const SlashMenu = forwardRef<SlashMenuHandle, Props>(function SlashMenu(
  { items, command },
  ref,
) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(1, items.length));
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % Math.max(1, items.length));
        return true;
      }
      if (event.key === "Enter") {
        const picked = items[index];
        if (picked) command(picked);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="patram-slash w-70 rounded-md border border-(--rule) bg-white p-3 text-sm shadow-[0_8px_24px_rgba(17,17,17,0.08)]">
        <div className="text-(--ink-faint)">No matching blocks</div>
      </div>
    );
  }

  return (
    <div className="patram-slash w-70 rounded-md border border-(--rule) bg-white p-1.5 text-[13px] shadow-[0_8px_24px_rgba(17,17,17,0.08)]">
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-(--ink-faint)">
        Basic blocks
      </div>
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          onMouseEnter={() => setIndex(i)}
          onClick={() => command(item)}
          className={
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left " +
            (i === index ? "bg-(--selection)" : "hover:bg-(--paper-soft)")
          }
        >
          <span className="inline-flex size-6 items-center justify-center rounded border border-(--rule) bg-(--paper) text-[11px] font-medium text-(--ink-soft)">
            {item.icon}
          </span>
          <span className="flex-1">
            <span className="block font-medium text-(--ink)">{item.title}</span>
            <span className="block text-[11px] text-(--ink-faint)">{item.description}</span>
          </span>
          {item.shortcut && (
            <span className="rounded border border-(--rule) bg-(--paper-soft) px-1 py-px text-[10px] text-(--ink-faint)">
              {item.shortcut}
            </span>
          )}
        </button>
      ))}
      <div className="mt-1 border-t border-(--rule) px-2.5 py-1.5 text-[11px] text-(--ink-faint)">
        ↑↓ browse · ↵ pick · esc to dismiss
      </div>
    </div>
  );
});
