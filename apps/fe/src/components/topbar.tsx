import { MoreHorizontal, Star } from "lucide-react";
import { FontPicker } from "#/components/font-picker";
import { SaveStatus } from "#/components/save-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";
import { useDocuments } from "#/stores/documents";

export function Topbar({ saveState }: { saveState: "idle" | "saving" }) {
  const selectedId = useDocuments((s) => s.selectedId);
  const doc = useDocuments((s) => (s.selectedId ? s.docs[s.selectedId] : null));
  const pinDoc = useDocuments((s) => s.pinDoc);
  const deleteDoc = useDocuments((s) => s.deleteDoc);

  if (!doc || !selectedId) return <header className="h-[44px] border-b border-[var(--line)]" />;

  return (
    <header className="flex h-[44px] items-center gap-2.5 border-b border-[var(--line)] px-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-[12px] text-[var(--sea-ink-soft)]"
      >
        <span>All documents</span>
        <span className="opacity-40">/</span>
        <span className="font-semibold text-[var(--sea-ink)]">{doc.title}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <FontPicker />
        <SaveStatus state={saveState} savedAt={doc.updatedAt} />
        <button
          type="button"
          aria-label={doc.pinned ? "Unpin document" : "Pin document"}
          onClick={() => pinDoc(selectedId, !doc.pinned)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white/70 text-[var(--sea-ink-soft)] hover:bg-white",
            doc.pinned && "text-[var(--lagoon-deep)]",
          )}
        >
          <Star className={cn("size-3.5", doc.pinned && "fill-current")} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="inline-flex size-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white/70 text-[var(--sea-ink-soft)] hover:bg-white"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem disabled>Duplicate</DropdownMenuItem>
            <DropdownMenuItem disabled>Change icon</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => deleteDoc(selectedId)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
