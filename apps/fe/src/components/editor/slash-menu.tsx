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
      <div className="patram-slash w-[280px] rounded-xl border border-[var(--line)] bg-white p-3 text-sm shadow-[0_18px_42px_rgb(30_90_72_/_0.22)]">
        <div className="text-[var(--sea-ink-soft)] italic">No matching blocks</div>
      </div>
    );
  }

  return (
    <div className="patram-slash w-[280px] rounded-xl border border-[var(--line)] bg-white p-1.5 text-[13px] shadow-[0_18px_42px_rgb(30_90_72_/_0.22)]">
      <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-bold tracking-[0.14em] text-[color:rgb(23_58_64_/_0.55)] uppercase">
        Basic blocks
      </div>
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          onMouseEnter={() => setIndex(i)}
          onClick={() => command(item)}
          className={
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left " +
            (i === index
              ? "bg-[color:rgb(79_184_178_/_0.14)]"
              : "hover:bg-[color:rgb(79_184_178_/_0.08)]")
          }
        >
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-[color:rgb(79_184_178_/_0.12)] text-xs font-bold text-[var(--lagoon-deep)]">
            {item.icon}
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-[var(--sea-ink)]">{item.title}</span>
            <span className="block text-[11px] text-[var(--sea-ink-soft)]">{item.description}</span>
          </span>
          {item.shortcut && (
            <span className="rounded border border-[var(--line)] bg-[color:rgb(23_58_64_/_0.06)] px-1 py-[1px] text-[10px] text-[var(--sea-ink-soft)]">
              {item.shortcut}
            </span>
          )}
        </button>
      ))}
      <div className="mt-1 border-t border-[var(--line)] px-2.5 py-1.5 text-[11px] text-[var(--sea-ink-soft)] italic">
        ↑↓ browse · ↵ pick · esc to dismiss
      </div>
    </div>
  );
});
