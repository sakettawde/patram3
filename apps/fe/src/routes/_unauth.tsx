import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "#/lib/api";
import { unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";

export const Route = createFileRoute("/_unauth")({
  beforeLoad: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData({
        queryKey: qk.me,
        queryFn: async () => unwrap(await api.me.$get()),
      });
      if (me) throw redirect({ to: "/" });
    } catch (e) {
      if ((e as { to?: string }).to) throw e;
      // 401 or network — stay on unauth routes
    }
  },
  component: () => <Outlet />,
});
