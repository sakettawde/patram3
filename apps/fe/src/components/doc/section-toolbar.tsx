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
      className={`pointer-events-none absolute top-0 right-0 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-(--line) bg-[rgba(251,255,248,0.92)] px-1.5 py-0.5 shadow-[0_4px_14px_rgba(23,58,64,0.06)] backdrop-blur-md transition-[opacity,transform] duration-200 ease-out ${
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 translate-y-[-30%] group-hover:-translate-y-1/2 group-hover:opacity-100 group-focus-within:-translate-y-1/2 group-focus-within:opacity-100"
      }`}
    >
      <span className="pointer-events-auto">
        <SaveStatePip state={state} onRetry={onRetry} />
      </span>
      <span aria-hidden className="h-3 w-px bg-(--line)" />
      <span className="pointer-events-auto">
        <SectionMenu disabledDelete={disabledDelete} onDelete={onDelete} />
      </span>
    </div>
  );
}
