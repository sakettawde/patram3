import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { SectionSave } from "#/lib/section-save-state";

const SAVING_GRACE_MS = 400;

export function SaveStatePip({ state, onRetry }: { state: SectionSave; onRetry?: () => void }) {
  const common = "inline-flex size-3 items-center justify-center rounded-full";
  const [showSaving, setShowSaving] = useState(false);

  useEffect(() => {
    if (state.status !== "saving") {
      setShowSaving(false);
      return;
    }
    const t = window.setTimeout(() => setShowSaving(true), SAVING_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [state.status]);

  switch (state.status) {
    case "idle":
      return <span className={common} aria-live="polite" />;
    case "dirty":
      return <span className={`${common} bg-[#d9a441]`} aria-label="Unsaved changes" />;
    case "saving":
      if (!showSaving) return <span className={common} aria-live="polite" />;
      return <Loader2 className="size-3.5 animate-spin text-(--lagoon-deep)" aria-label="Saving" />;
    case "saved":
      return (
        <span className={`${common} bg-(--lagoon) text-white`} aria-label="Saved">
          <Check className="size-2" />
        </span>
      );
    case "error":
      return (
        <button
          onClick={onRetry}
          className={`${common} bg-red-600`}
          aria-label="Save failed, click to retry"
        />
      );
  }
}
