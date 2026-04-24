import { Check, Loader2 } from "lucide-react";
import type { SectionSave } from "#/lib/section-save-state";

export function SaveStatePip({ state, onRetry }: { state: SectionSave; onRetry?: () => void }) {
  const common = "inline-flex size-3 items-center justify-center rounded-full";
  switch (state.status) {
    case "idle":
      return <span className={common} aria-live="polite" />;
    case "dirty":
      return <span className={`${common} bg-[#d9a441]`} aria-label="Unsaved changes" />;
    case "saving":
      return (
        <Loader2 className="size-3.5 animate-spin text-[var(--lagoon-deep)]" aria-label="Saving" />
      );
    case "saved":
      return (
        <span className={`${common} bg-[var(--lagoon)] text-white`} aria-label="Saved">
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
    case "conflict":
      return <span className={`${common} border border-[#d9a441]`} aria-label="Version conflict" />;
  }
}
