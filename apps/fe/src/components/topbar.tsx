import { MoreHorizontal, Sparkles } from "lucide-react";
import { useUser } from "#/auth/auth-gate";
import { SaveStatus } from "#/components/save-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";
import { useDeleteDoc, useDocumentsQuery } from "#/queries/documents";
import { assistantStore, useAssistant } from "#/stores/assistant";
import { useDocuments } from "#/stores/documents";

export function Topbar({ saveState }: { saveState: "idle" | "saving" }) {
  const user = useUser();
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const query = useDocumentsQuery(user.id);
  const doc = query.data?.find((d) => d.id === selectedId) ?? null;
  const deleteDoc = useDeleteDoc(user.id);
  const assistantOpen = useAssistant((s) => s.open);

  const toggleAssistant = () => assistantStore.getState().toggleOpen();

  if (!doc || !selectedId) {
    return (
      <header className="flex h-11 items-center border-b border-(--rule) px-3">
        <AssistantToggle open={assistantOpen} onClick={toggleAssistant} />
      </header>
    );
  }

  const onDelete = async () => {
    await deleteDoc.mutateAsync(selectedId);
    selectDoc(null);
  };

  return (
    <header className="flex h-11 items-center gap-3 border-b border-(--rule) px-3">
      <AssistantToggle open={assistantOpen} onClick={toggleAssistant} />
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
            <DropdownMenuItem variant="destructive" onSelect={() => void onDelete()}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function AssistantToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle assistant"
      aria-pressed={open}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md transition",
        open
          ? "bg-(--paper-soft) text-(--ink)"
          : "text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)",
      )}
    >
      <Sparkles className="size-3.5" />
    </button>
  );
}
