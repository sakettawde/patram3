import { useEffect, useState } from "react";
import { formatRelativeTime } from "#/lib/format-time";

export function SaveStatus({ state, savedAt }: { state: "idle" | "saving"; savedAt: number }) {
  const [, force] = useState(0);

  useEffect(() => {
    const iv = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  const label = state === "saving" ? "Saving…" : `Saved · ${formatRelativeTime(savedAt)}`;

  return <span className="text-[12px] text-(--ink-faint)">{label}</span>;
}
