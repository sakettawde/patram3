import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { formatRelativeTime } from "#/lib/format-time";
import { cn } from "#/lib/utils";

export function SessionRow({
  title,
  updatedAt,
  active,
  onClick,
  onDelete,
}: {
  title: string;
  updatedAt: number;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group mx-2 my-px flex w-[calc(100%-1rem)] items-center rounded-md px-2 py-1.5 text-[13px] transition",
        active
          ? "bg-(--selection) font-medium text-(--ink)"
          : "text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-2 overflow-hidden text-left"
      >
        <span className="truncate">{title || "New chat"}</span>
        <span className="ml-auto shrink-0 text-[11px] text-(--ink-faint)">
          {formatRelativeTime(updatedAt)}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Session actions"
            onClick={(e) => e.stopPropagation()}
            className="ml-1 inline-flex size-5 items-center justify-center rounded text-(--ink-faint) opacity-0 hover:bg-(--paper) group-hover:opacity-100"
          >
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
