import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "#/lib/utils";
import { useUi } from "#/stores/ui";
import { DocsList } from "./docs-list";
import { SessionsList } from "./sessions-list";
import { SidebarTabs } from "./sidebar-tabs";
import { ProfileMenu } from "#/components/profile-menu";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const tab = useUi((s) => s.sidebarTab);
  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-(--rule) bg-(--paper) transition-[width] duration-200",
        collapsed ? "w-0 border-r-0" : "w-60",
      )}
    >
      {!collapsed && (
        <>
          <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3">
            <span className="text-[14px] font-semibold tracking-tight text-(--ink)">Patram</span>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Collapse sidebar"
              className="-mr-1 inline-flex size-6 items-center justify-center rounded-md text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)"
            >
              <PanelLeftClose className="size-3.5" />
            </button>
          </div>
          <SidebarTabs />
          {tab === "docs" ? <DocsList /> : <SessionsList />}
          <ProfileMenu />
        </>
      )}
      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="fixed top-3 left-3 z-10 inline-flex size-7 items-center justify-center rounded-md border border-(--rule) bg-(--paper) text-(--ink-soft) hover:bg-(--paper-soft)"
        >
          <PanelLeftOpen className="size-3.5" />
        </button>
      )}
    </aside>
  );
}
