import type { SectionSave } from "#/lib/section-save-state";
import { SaveStatePip } from "./save-state-pip";
import { SectionMenu } from "./section-menu";

export function SectionToolbar({
  state,
  onRetry,
  disabledDelete,
  onDelete,
  alwaysVisible,
}: {
  state: SectionSave;
  onRetry?: () => void;
  disabledDelete: boolean;
  onDelete: () => void;
  alwaysVisible: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute top-1 right-1 z-10 flex items-center gap-1 transition-opacity ${
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      }`}
    >
      <span className="pointer-events-auto">
        <SaveStatePip state={state} onRetry={onRetry} />
      </span>
      <span className="pointer-events-auto">
        <SectionMenu disabledDelete={disabledDelete} onDelete={onDelete} />
      </span>
    </div>
  );
}
