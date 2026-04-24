import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRelativeTime } from "#/lib/format-time";
import type { SaveRollup } from "#/lib/save-rollup";

export function SaveStatus({ rollup }: { rollup: SaveRollup }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  if (rollup.kind === "saving") {
    return (
      <Chip>
        <Loader2 className="size-3 animate-spin" /> Saving…
      </Chip>
    );
  }
  if (rollup.kind === "unsaved") {
    return <Chip tone="warn">Unsaved changes</Chip>;
  }
  if (rollup.kind === "editing") {
    return <Chip tone="dim">Editing…</Chip>;
  }
  return (
    <Chip>
      <Dot /> Saved · {formatRelativeTime(rollup.savedAt || Date.now())}
    </Chip>
  );
}

function Chip({
  children,
  tone = "ok",
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "dim";
}) {
  const bg =
    tone === "warn"
      ? "bg-[rgb(220_90_80_/_0.12)] text-red-700"
      : tone === "dim"
        ? "bg-[rgb(23_58_64_/_0.06)] text-[var(--sea-ink-soft)]"
        : "bg-[rgb(79_184_178_/_0.12)] text-[var(--lagoon-deep)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${bg}`}
    >
      {children}
    </span>
  );
}

function Dot() {
  return (
    <span className="inline-flex size-3 items-center justify-center rounded-full bg-(--lagoon) text-[8px] text-white">
      <Check className="size-2" />
    </span>
  );
}
