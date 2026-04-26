import type { ReactNode } from "react";

export function SidebarSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="mt-1">
      <header className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="text-[11px] font-medium text-(--ink-faint)">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[11px] text-(--ink-faint)">{count}</span>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}
