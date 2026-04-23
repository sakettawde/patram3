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
    <section className="mt-2">
      <header className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[10.5px] font-bold tracking-[0.16em] text-[color:rgb(23_58_64_/_0.55)] uppercase">
          {label}
        </span>
        {count !== undefined && (
          <span className="text-[11px] text-[color:rgb(23_58_64_/_0.5)]">{count}</span>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}
