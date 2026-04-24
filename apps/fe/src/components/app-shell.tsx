import { useEffect } from "react";
import { DocSurface } from "#/components/doc/doc-surface";
import { Sidebar } from "#/components/sidebar/sidebar";
import { Topbar } from "#/components/topbar";
import { useDocumentsList } from "#/queries/documents";
import { useUi } from "#/stores/ui";

export function AppShell() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const selectedId = useUi((s) => s.selectedDocumentId);
  const statusFilter = useUi((s) => s.statusFilter);
  const list = useDocumentsList({ status: statusFilter });
  const selectDoc = useUi((s) => s.selectDocument);

  useEffect(() => {
    if (!selectedId && list.data && list.data.length > 0) {
      const first = list.data[0];
      if (first) selectDoc(first.id);
    }
  }, [selectedId, list.data, selectDoc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <div className="grid h-screen w-screen grid-cols-[auto_1fr] overflow-hidden bg-white">
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggle} />
      <main className="flex h-screen flex-col overflow-hidden">
        <Topbar documentId={selectedId} />
        <div className="flex-1 overflow-y-auto">
          <DocSurface documentId={selectedId} />
        </div>
      </main>
    </div>
  );
}
