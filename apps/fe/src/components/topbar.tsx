import { MoreHorizontal } from "lucide-react";
import { SaveStatus } from "#/components/save-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useDocuments } from "#/stores/documents";

export function Topbar({ saveState }: { saveState: "idle" | "saving" }) {
  const selectedId = useDocuments((s) => s.selectedId);
  const doc = useDocuments((s) => (s.selectedId ? s.docs[s.selectedId] : null));
  const deleteDoc = useDocuments((s) => s.deleteDoc);

  if (!doc || !selectedId) return <header className="h-11 border-b border-(--rule)" />;

  return (
    <header className="flex h-11 items-center gap-3 border-b border-(--rule) px-5">
      <h1 className="truncate text-[13px] font-medium text-(--ink)">{doc.title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <SaveStatus state={saveState} savedAt={doc.updatedAt} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem variant="destructive" onSelect={() => deleteDoc(selectedId)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
