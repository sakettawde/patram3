import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";

export const Route = createFileRoute("/_unauth")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: qk.me,
        queryFn: async () => unwrap(await api.me.$get()),
      });
      // /me succeeded → user is authed; redirect to app home
      throw redirect({ to: "/" });
    } catch (e) {
      // Re-throw the redirect object
      if (e && typeof e === "object" && "to" in e) throw e;
      // Stay on unauth routes only for 401
      if (e instanceof ApiError && e.status === 401) return;
      // Anything else (network error, 5xx) — rethrow
      throw e;
    }
  },
  component: () => <Outlet />,
});
