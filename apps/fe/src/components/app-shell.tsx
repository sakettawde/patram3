import { useEffect, useState } from "react";
import { DocSurface } from "#/components/doc/doc-surface";
import { Sidebar } from "#/components/sidebar/sidebar";
import { Topbar } from "#/components/topbar";

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 960;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid h-screen w-screen grid-cols-[auto_1fr] overflow-hidden bg-(--paper)">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
      <main className="flex h-screen flex-col overflow-hidden">
        <Topbar saveState={saving ? "saving" : "idle"} />
        <div className="flex-1 overflow-y-auto">
          <DocSurface onSavingChange={setSaving} />
        </div>
      </main>
    </div>
  );
}
