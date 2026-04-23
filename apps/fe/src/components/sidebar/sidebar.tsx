import { PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import { cmdKey } from "#/lib/shortcut";
import { cn } from "#/lib/utils";
import { useDocuments } from "#/stores/documents";
import { DocRow } from "./doc-row";
import { SidebarSection } from "./sidebar-section";
import { UserChip } from "./user-chip";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const order = useDocuments((s) => s.order);
  const docs = useDocuments((s) => s.docs);
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const createDoc = useDocuments((s) => s.createDoc);

  const pinned = order.filter((id) => docs[id]?.pinned);
  const rest = order.filter((id) => !docs[id]?.pinned);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-[var(--line)] bg-gradient-to-b from-white/92 to-[color:rgb(243_250_245_/_0.86)] transition-[width] duration-200",
        collapsed ? "w-[56px]" : "w-[264px]",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        {!collapsed && (
          <div className="flex items-center gap-2 font-['Fraunces',Georgia,serif] text-[17px] font-bold tracking-tight text-[var(--sea-ink)]">
            <span
              aria-hidden
              className="inline-block size-[18px] rounded-md bg-gradient-to-br from-[var(--lagoon)] to-[var(--palm)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
            />
            Patram
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex size-[26px] items-center justify-center rounded-lg border border-[var(--line)] bg-white/60 text-[var(--sea-ink-soft)] hover:bg-white"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-3.5" />
          ) : (
            <PanelLeftClose className="size-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mx-3 mt-1 mb-2.5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white/80 px-2.5 py-2 text-[12px] text-[var(--sea-ink-soft)]">
            <Search className="size-3.5" />
            <span className="flex-1">Search documents</span>
            <span className="rounded border border-[var(--line)] bg-[color:rgb(23_58_64_/_0.06)] px-1.5 py-[1px] text-[10px]">
              {cmdKey()}K
            </span>
          </div>

          <button
            type="button"
            onClick={() => createDoc()}
            className="mx-3 mb-3.5 flex items-center gap-2 rounded-lg bg-gradient-to-b from-[var(--lagoon)] to-[var(--lagoon-deep)] px-3 py-2 text-[13px] font-semibold text-white shadow-[0_6px_14px_rgb(50_143_151_/_0.28),inset_0_1px_0_rgb(255_255_255_/_0.3)] transition hover:brightness-105"
          >
            <span className="inline-flex size-[18px] items-center justify-center rounded-md bg-white/25">
              <Plus className="size-3.5" />
            </span>
            New document
          </button>

          {pinned.length > 0 && (
            <SidebarSection label="Pinned" count={pinned.length}>
              {pinned.map((id) => {
                const d = docs[id];
                if (!d) return null;
                return (
                  <DocRow
                    key={id}
                    emoji={d.emoji}
                    title={d.title}
                    pinned
                    active={selectedId === id}
                    onClick={() => selectDoc(id)}
                  />
                );
              })}
            </SidebarSection>
          )}

          <SidebarSection label="All documents" count={rest.length}>
            {rest.map((id) => {
              const d = docs[id];
              if (!d) return null;
              return (
                <DocRow
                  key={id}
                  emoji={d.emoji}
                  title={d.title}
                  pinned={false}
                  active={selectedId === id}
                  onClick={() => selectDoc(id)}
                />
              );
            })}
          </SidebarSection>

          <UserChip name="Saket" email="saket.tawde@in.artofliving.org" />
        </>
      )}
    </aside>
  );
}
