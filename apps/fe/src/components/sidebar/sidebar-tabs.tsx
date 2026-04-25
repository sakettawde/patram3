import { cn } from "#/lib/utils";
import { type SidebarTab, useUi, uiStore } from "#/stores/ui";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "docs", label: "Docs" },
  { id: "sessions", label: "Sessions" },
];

export function SidebarTabs() {
  const active = useUi((s) => s.sidebarTab);
  return (
    <div className="mx-3 mb-2 flex rounded-md bg-(--paper-soft) p-0.5">
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => uiStore.getState().setSidebarTab(t.id)}
            aria-pressed={isActive}
            className={cn(
              "flex-1 rounded px-2 py-1 text-[12px] transition",
              isActive
                ? "bg-(--paper) text-(--ink) shadow-[0_0_0_1px_var(--rule)]"
                : "text-(--ink-faint) hover:text-(--ink-soft)",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
