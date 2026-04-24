export function DocRow({
  id,
  title,
  emoji,
  active,
  onSelect,
}: {
  id: string;
  title: string;
  emoji: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      data-doc-id={id}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${active ? "bg-[rgb(79_184_178_/_0.18)] text-[var(--sea-ink)]" : "text-[var(--sea-ink)] hover:bg-[rgb(79_184_178_/_0.1)]"}`}
    >
      <span className="text-base">{emoji}</span>
      <span className="truncate">{title}</span>
    </button>
  );
}
