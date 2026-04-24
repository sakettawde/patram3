import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

export function SectionMenu({
  disabledDelete,
  onDelete,
}: {
  disabledDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Section actions"
        className="flex size-5 items-center justify-center rounded-full text-(--sea-ink-soft) transition-colors hover:bg-[rgb(79_184_178/0.16)] hover:text-(--sea-ink)"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuItem
          disabled={disabledDelete}
          onClick={onDelete}
          variant="destructive"
          className={disabledDelete ? "opacity-50" : ""}
          title={disabledDelete ? "A document needs at least one section" : undefined}
        >
          Delete section
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
