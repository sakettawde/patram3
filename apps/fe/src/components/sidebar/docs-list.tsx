import { Plus, Search } from "lucide-react";
import { useUser } from "#/auth/auth-gate";
import { useCreateDoc, useDeleteDoc, useDocumentsQuery } from "#/queries/documents";
import { useDocuments } from "#/stores/documents";
import { DocRow } from "./doc-row";
import { SidebarSection } from "./sidebar-section";

export function DocsList() {
  const user = useUser();
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const query = useDocumentsQuery(user.id);
  const createDoc = useCreateDoc(user.id);
  const _deleteDoc = useDeleteDoc(user.id); // wired for the future delete UI; v1 has no UI button.
  void _deleteDoc;

  const docs = query.data ?? [];
  // Server returns docs sorted by createdAt ASC. Honour that exactly.

  const onCreate = async () => {
    const row = await createDoc.mutateAsync({});
    selectDoc(row.id);
  };

  return (
    <>
      <div className="px-3 pt-1 pb-2">
        <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-(--ink-faint) hover:bg-(--paper-soft)">
          <Search className="size-3.5" />
          <input
            type="text"
            placeholder="Search documents"
            aria-label="Search documents"
            className="w-full bg-transparent text-(--ink) placeholder:text-(--ink-faint) focus:outline-none"
          />
        </label>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={createDoc.isPending}
          aria-label="New document"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink) disabled:opacity-60"
        >
          <Plus className="size-3.5" />
          <span>New document</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        <SidebarSection label="Documents" count={docs.length}>
          {docs.map((d) => (
            <DocRow
              key={d.id}
              title={d.title}
              active={selectedId === d.id}
              onClick={() => selectDoc(d.id)}
            />
          ))}
        </SidebarSection>
      </div>
    </>
  );
}
