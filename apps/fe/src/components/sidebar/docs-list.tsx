import { Plus, Search } from "lucide-react";
import { useDocuments } from "#/stores/documents";
import { DocRow } from "./doc-row";
import { SidebarSection } from "./sidebar-section";

export function DocsList() {
  const order = useDocuments((s) => s.order);
  const docs = useDocuments((s) => s.docs);
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const createDoc = useDocuments((s) => s.createDoc);

  const sortedIds = [...order].sort((a, b) => {
    const da = docs[a]?.updatedAt ?? 0;
    const db = docs[b]?.updatedAt ?? 0;
    return db - da;
  });

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
          onClick={() => createDoc()}
          aria-label="New document"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)"
        >
          <Plus className="size-3.5" />
          <span>New document</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        <SidebarSection label="Documents" count={sortedIds.length}>
          {sortedIds.map((id) => {
            const d = docs[id];
            if (!d) return null;
            return (
              <DocRow
                key={id}
                title={d.title}
                active={selectedId === id}
                onClick={() => selectDoc(id)}
              />
            );
          })}
        </SidebarSection>
      </div>
    </>
  );
}
