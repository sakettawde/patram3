import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

export function SidebarNavLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/skills" | "/settings";
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="mx-2 my-px flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-(--ink-soft) transition hover:bg-(--paper-soft) hover:text-(--ink)"
      activeProps={{
        className:
          "mx-2 my-px flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-[13px] bg-(--selection) font-medium text-(--ink)",
      }}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </Link>
  );
}
