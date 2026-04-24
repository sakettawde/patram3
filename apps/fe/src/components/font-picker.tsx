import { Type } from "lucide-react";
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import {
  applyPairing,
  FONT_PAIRINGS,
  getPairing,
  loadPairingId,
  savePairingId,
} from "#/lib/font-pairings";
import { cn } from "#/lib/utils";

export function FontPicker() {
  const [activeId, setActiveId] = useState<string>(() => loadPairingId());

  useEffect(() => {
    applyPairing(getPairing(activeId));
    savePairingId(activeId);
  }, [activeId]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change typography"
          className="inline-flex size-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white/70 text-[var(--sea-ink-soft)] transition hover:bg-white"
        >
          <Type className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-1.5">
        <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-bold tracking-[0.14em] text-[color:rgb(23_58_64_/_0.55)] uppercase">
          Typography
        </div>
        <div className="flex flex-col gap-0.5">
          {FONT_PAIRINGS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                activeId === p.id
                  ? "bg-[color:rgb(79_184_178_/_0.14)]"
                  : "hover:bg-[color:rgb(79_184_178_/_0.08)]",
              )}
            >
              <span className="flex-1 min-w-0">
                <span
                  className="block text-[17px] leading-tight text-[var(--sea-ink)]"
                  style={{ fontFamily: p.display, fontWeight: 700, letterSpacing: "-0.01em" }}
                >
                  {p.name}
                </span>
                <span
                  className="mt-0.5 block text-[11.5px] text-[var(--sea-ink-soft)]"
                  style={{ fontFamily: p.body }}
                >
                  {p.description}
                </span>
              </span>
              {activeId === p.id && (
                <span aria-hidden className="size-1.5 rounded-full bg-[var(--lagoon-deep)]" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
