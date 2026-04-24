import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--foam)] to-[var(--sand)] px-6 py-14">
      <div className="mx-auto flex max-w-[420px] flex-col items-center">
        <div className="mb-6 flex items-center gap-2">
          <div
            className="size-[18px] rounded-md"
            style={{ background: "linear-gradient(135deg, var(--lagoon), var(--palm))" }}
          />
          <span className="font-['Fraunces',Georgia,serif] text-xl text-[var(--sea-ink)]">
            Patram
          </span>
        </div>
        <div className="w-full rounded-2xl border border-[var(--line)] bg-white/80 p-6 shadow-[0_18px_40px_rgb(23_58_64_/_0.08)] backdrop-blur">
          <h1 className="font-['Fraunces',Georgia,serif] text-2xl text-[var(--sea-ink)]">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
