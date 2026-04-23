import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { EmojiPalette } from "./emoji-palette";

export function DocEmoji({ emoji, onChange }: { emoji: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [spring, setSpring] = useState(false);

  useEffect(() => {
    setSpring(true);
    const t = window.setTimeout(() => setSpring(false), 200);
    return () => window.clearTimeout(t);
  }, [emoji]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change document icon"
          className="mb-3.5 inline-block rounded-lg px-2 text-[42px] leading-none transition hover:bg-[color:rgb(79_184_178_/_0.1)]"
          style={{
            transform: spring ? "scale(1)" : undefined,
            animation: spring ? "emoji-spring 180ms cubic-bezier(0.34,1.56,0.64,1)" : undefined,
          }}
        >
          {emoji}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <EmojiPalette
          onPick={(e) => {
            onChange(e);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
