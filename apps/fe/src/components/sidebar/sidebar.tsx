import { useCreateDocument, useDocumentsList } from "#/queries/documents";
import { useUi } from "#/stores/ui";
import { DocRow } from "./doc-row";
import { UserChip } from "./user-chip";
import type { DocStatus } from "#/lib/domain-types";
import { Plus } from "lucide-react";

const STATUSES: Array<{ value: DocStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const filter = useUi((s) => s.statusFilter);
  const setFilter = useUi((s) => s.setStatusFilter);
  const selectedId = useUi((s) => s.selectedDocumentId);
  const selectDoc = useUi((s) => s.selectDocument);
  const docs = useDocumentsList({ status: filter });
  const createDoc = useCreateDocument();

  if (collapsed) {
    return (
      <aside className="flex w-[56px] flex-col items-center border-r border-[var(--line)] bg-[var(--surface)] py-3">
        <button
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="rounded p-1 hover:bg-[rgb(79_184_178_/_0.1)]"
        >
          ⇥
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[264px] flex-col border-r border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-['Fraunces',Georgia,serif] text-lg text-[var(--sea-ink)]">
          Patram
        </span>
        <button
          onClick={onToggleCollapsed}
          aria-label="Collapse sidebar"
          className="rounded p-1 hover:bg-[rgb(79_184_178_/_0.1)]"
        >
          ⇤
        </button>
      </div>

      <button
        onClick={async () => {
          const res = await createDoc.mutateAsync({});
          selectDoc(res.document.id);
        }}
        disabled={createDoc.isPending}
        className="mx-3 my-2 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--lagoon-deep)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        <Plus className="size-4" /> New document
      </button>

      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`rounded-full px-2 py-0.5 text-[11px] ${filter === s.value ? "bg-[rgb(79_184_178_/_0.2)] text-[var(--sea-ink)]" : "text-[var(--sea-ink-soft)] hover:bg-[rgb(79_184_178_/_0.1)]"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {docs.isLoading ? (
          <div className="px-2 text-xs text-[var(--sea-ink-soft)]">Loading…</div>
        ) : (
          (docs.data ?? []).map((d) => (
            <DocRow
              key={d.id}
              id={d.id}
              title={d.title || "Untitled"}
              emoji={d.emoji ?? "📝"}
              active={d.id === selectedId}
              onSelect={() => selectDoc(d.id)}
            />
          ))
        )}
      </div>

      <UserChip />
    </aside>
  );
}
