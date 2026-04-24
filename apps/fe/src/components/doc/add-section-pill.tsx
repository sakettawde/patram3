import { Plus } from "lucide-react";

export function AddSectionPill({ onClick }: { onClick: () => void }) {
  return (
    <div className="group/gap relative flex h-6 items-center justify-center">
      <button
        onClick={onClick}
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[rgb(79_184_178_/_0.35)] bg-white px-2 py-0.5 text-[11px] text-[var(--lagoon-deep)] opacity-0 transition-opacity group-hover/gap:opacity-100 focus:opacity-100"
      >
        <Plus className="size-3" /> Add section
      </button>
    </div>
  );
}
