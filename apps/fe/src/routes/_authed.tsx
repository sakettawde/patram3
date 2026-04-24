import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";
import type { MeResponse } from "#/queries/me";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData<MeResponse>({
        queryKey: qk.me,
        queryFn: async () => unwrap(await api.me.$get()),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        throw redirect({ to: "/sign-in" });
      }
      throw e;
    }
  },
  component: () => <Outlet />,
});
