export function UserChip({ name }: { name: string }) {
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-(--rule) px-4 py-3 text-[12px] text-(--ink-soft)">
      <span className="truncate">{name}</span>
    </div>
  );
}
