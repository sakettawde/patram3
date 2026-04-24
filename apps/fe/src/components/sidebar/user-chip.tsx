import { useMe, useSignOut } from "#/queries/me";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { qk } from "#/lib/query-keys";

export function UserChip() {
  const me = useMe();
  const signOut = useSignOut();
  const router = useRouter();
  const qc = useQueryClient();

  const seedDev = import.meta.env.DEV
    ? async () => {
        await fetch("/dev/seed", { method: "POST", credentials: "include" });
        void qc.invalidateQueries({ queryKey: qk.documents });
      }
    : null;

  if (!me.data) return null;
  return (
    <div className="mt-auto border-t border-[var(--line)] px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[var(--sea-ink)]">
            {me.data.user.name || me.data.user.email}
          </div>
          <div className="truncate text-[10.5px] text-[var(--sea-ink-soft)]">
            {me.data.workspace.name}
          </div>
        </div>
        <button
          onClick={async () => {
            try {
              await signOut.mutateAsync();
            } catch (err) {
              // If the server call fails we still drop local state so the user
              // isn't stuck signed in the UI.
              console.warn("[patram] Sign-out request failed, clearing local state.", err);
              qc.clear();
            }
            await router.invalidate();
            void router.navigate({ to: "/sign-in" });
          }}
          disabled={signOut.isPending}
          className="rounded px-2 py-1 text-[11px] text-[var(--sea-ink-soft)] hover:bg-[rgb(79_184_178_/_0.1)] disabled:opacity-60"
          aria-label="Sign out"
        >
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {seedDev ? (
        <button
          onClick={seedDev}
          className="mt-2 w-full rounded border border-dashed border-[var(--line)] px-2 py-1 text-[10.5px] text-[var(--sea-ink-soft)] hover:bg-[rgb(79_184_178_/_0.06)]"
        >
          Seed sample docs (dev)
        </button>
      ) : null}
    </div>
  );
}
