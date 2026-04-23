import { Star } from "lucide-react";
import { cn } from "#/lib/utils";

export function DocRow({
  emoji,
  title,
  pinned,
  active,
  onClick,
}: {
  emoji: string;
  title: string;
  pinned: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mx-2 my-0.5 flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition",
        active
          ? "border border-[color:rgb(79_184_178_/_0.35)] bg-[color:rgb(79_184_178_/_0.18)] px-[9px] py-[6px] text-[var(--sea-ink)]"
          : "text-[color:rgb(42_74_80)] hover:bg-[color:rgb(79_184_178_/_0.1)] hover:shadow-[0_0_0_1px_rgb(79_184_178_/_0.25)]",
      )}
    >
      <span className="w-[18px] text-center">{emoji}</span>
      <span className="truncate">{title}</span>
      {pinned && <Star className="ml-auto size-3 fill-current text-[var(--lagoon-deep)]" />}
    </button>
  );
}
