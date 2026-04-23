export function UserChip({ name, email }: { name: string; email: string }) {
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--line)] px-3 py-3">
      <div
        aria-hidden
        className="inline-flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--palm)] to-[var(--lagoon)] text-[12px] font-bold text-white"
      >
        {initial}
      </div>
      <div className="min-w-0 text-[12px] leading-tight">
        <div className="truncate font-semibold text-[var(--sea-ink)]">{name}</div>
        <div className="truncate text-[10.5px] text-[var(--sea-ink-soft)]">{email}</div>
      </div>
    </div>
  );
}
