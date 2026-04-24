import { useEffect } from "react";
import { DocSurface } from "#/components/doc/doc-surface";
import { Sidebar } from "#/components/sidebar/sidebar";
import { Topbar } from "#/components/topbar";
import { useUi } from "#/stores/ui";

export function AppShell() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const selectedId = useUi((s) => s.selectedDocumentId);

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
        {/* TODO(Task 21): replace saveState shim with documentId prop */}
        <Topbar saveState="idle" />
        <div className="flex-1 overflow-y-auto">
          <DocSurface documentId={selectedId} />
        </div>
      </main>
    </div>
  );
}
