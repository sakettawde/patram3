import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useSignUp } from "#/queries/me";
import { ApiError } from "#/lib/api-error";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const signUp = useSignUp();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await signUp.mutateAsync({ name, email, password });
          await router.invalidate();
          router.navigate({ to: "/" });
        } catch (x) {
          if (x instanceof ApiError) {
            if (x.status === 422 || x.status === 400)
              setErr("That email is already in use or invalid.");
            else setErr("Something went wrong. Try again.");
          } else setErr("Something went wrong. Try again.");
        }
      }}
      className="flex flex-col gap-3"
    >
      <Field label="Display name" value={name} onChange={setName} />
      <Field label="Email" type="email" value={email} onChange={setEmail} />
      <Field
        label="Password"
        type="password"
        minLength={8}
        value={password}
        onChange={setPassword}
      />
      {err ? (
        <p role="alert" className="text-xs text-red-600">
          {err}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={signUp.isPending}
        className="mt-1 rounded-md bg-[var(--lagoon-deep)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--lagoon)] disabled:opacity-60"
      >
        {signUp.isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  minLength?: number;
}) {
  return (
    <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
      {label}
      <input
        type={type}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
    </label>
  );
}
