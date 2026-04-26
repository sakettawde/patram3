import { cn } from "#/lib/utils";

export function DocRow({
  title,
  active,
  onClick,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mx-2 my-px flex w-[calc(100%-1rem)] items-center rounded-md px-2 py-1.5 text-left text-[13px] transition",
        active
          ? "bg-(--selection) font-medium text-(--ink)"
          : "text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)",
      )}
    >
      <span className="truncate">{title || "Untitled"}</span>
    </button>
  );
}
