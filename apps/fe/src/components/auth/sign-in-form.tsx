import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useSignIn } from "#/queries/me";
import { ApiError } from "#/lib/api-error";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const signIn = useSignIn();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await signIn.mutateAsync({ email, password });
          await router.invalidate();
          void router.navigate({ to: "/" });
        } catch (x) {
          if (x instanceof ApiError && x.status === 401) setErr("Wrong email or password");
          else setErr("Something went wrong. Try again.");
        }
      }}
      className="flex flex-col gap-3"
    >
      <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </label>
      <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
        Password
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </label>
      {err ? (
        <p role="alert" className="text-xs text-red-600">
          {err}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={signIn.isPending}
        className="mt-1 rounded-md bg-[var(--lagoon-deep)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--lagoon)] disabled:opacity-60"
      >
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
