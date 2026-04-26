import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/_app")({ component: AppLayout });
