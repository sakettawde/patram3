import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AssistantPanel } from "#/components/assistant/assistant-panel";
import { Sidebar } from "#/components/sidebar/sidebar";
import { Topbar } from "#/components/topbar";
import { cn } from "#/lib/utils";
import { assistantStore, useAssistant } from "#/stores/assistant";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 960;
  });
  const assistantOpen = useAssistant((s) => s.open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        assistantStore.getState().toggleOpen();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid h-screen w-screen grid-cols-[auto_1fr] overflow-hidden bg-(--paper)">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
      <main className="flex h-screen min-w-0 flex-col overflow-hidden">
        <Topbar />
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Assistant"
            className={cn(
              "flex h-full overflow-hidden border-r border-(--rule) bg-(--paper) transition-[width,opacity] duration-200 ease-out",
              assistantOpen ? "w-1/2 opacity-100" : "w-0 border-r-0 opacity-0",
            )}
          >
            <div className="h-full w-full">{assistantOpen && <AssistantPanel />}</div>
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
