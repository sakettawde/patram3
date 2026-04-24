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
        className="rounded p-1 hover:bg-[rgb(79_184_178_/_0.1)]"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={disabledDelete}
          onClick={onDelete}
          className={disabledDelete ? "opacity-50" : "text-red-600"}
          title={disabledDelete ? "A document needs at least one section" : undefined}
        >
          Delete section
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
