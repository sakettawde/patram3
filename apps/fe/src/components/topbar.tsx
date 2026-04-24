import { MoreHorizontal } from "lucide-react";
import { useDocument, useDeleteDocument, useUpdateDocument } from "#/queries/documents";
import { useUi } from "#/stores/ui";
import { SaveStatus } from "./save-status";
import { FontPicker } from "#/components/font-picker";
import { computeSaveRollup } from "#/lib/save-rollup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { DocStatus } from "#/lib/domain-types";

const STATUS_OPTIONS: DocStatus[] = ["draft", "review", "published", "archived"];

export function Topbar({ documentId }: { documentId: string | null }) {
  const q = useDocument(documentId);
  const selectDoc = useUi((s) => s.selectDocument);
  const sectionSaveStates = useUi((s) => s.sectionSaveStates);
  const update = useUpdateDocument(documentId ?? "__none__");
  const del = useDeleteDocument();

  const rollup = computeSaveRollup({
    sections: sectionSaveStates,
    docMetadataPending: update.isPending,
  });

  return (
    <div className="flex h-11 items-center justify-between border-b border-(--line) px-4">
      <div className="text-xs text-(--sea-ink-soft)">
        <span>All documents</span>
        {q.data ? (
          <>
            {" / "}
            <span className="text-(--sea-ink)">{q.data.document.title || "Untitled"}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <FontPicker />
        <SaveStatus rollup={rollup} />
        {documentId && q.data ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Document actions"
              className="rounded p-1 hover:bg-[rgb(79_184_178/0.1)]"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Status: {q.data.document.status}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {STATUS_OPTIONS.map((s) => (
                    <DropdownMenuItem key={s} onClick={() => update.mutate({ status: s })}>
                      {s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  if (!confirm("Delete this document?")) return;
                  await del.mutateAsync(documentId);
                  selectDoc(null);
                }}
                className="text-red-600"
              >
                Delete document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
