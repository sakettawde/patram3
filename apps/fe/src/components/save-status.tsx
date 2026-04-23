import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRelativeTime } from "#/lib/format-time";

export function SaveStatus({ state, savedAt }: { state: "idle" | "saving"; savedAt: number }) {
  const [, force] = useState(0);

  useEffect(() => {
    const iv = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  const label = state === "saving" ? "Saving…" : `Saved · ${formatRelativeTime(savedAt)}`;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:rgb(79_184_178_/_0.12)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--lagoon-deep)]">
      {state === "saving" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className="inline-flex size-3 items-center justify-center rounded-full bg-[var(--lagoon)] text-[8px] text-white">
          <Check className="size-2" />
        </span>
      )}
      {label}
    </span>
  );
}
