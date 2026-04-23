import { formatRelativeTime } from "#/lib/format-time";

export function DocMeta({
  tag,
  updatedAt,
  wordCount,
}: {
  tag: string | null;
  updatedAt: number;
  wordCount: number;
}) {
  return (
    <div className="mb-7 flex items-center gap-2 text-[12px] text-[var(--sea-ink-soft)]">
      {tag && (
        <span className="rounded-full bg-[color:rgb(47_106_74_/_0.12)] px-2 py-0.5 text-[10.5px] font-semibold tracking-wider text-[var(--palm)] uppercase">
          {tag}
        </span>
      )}
      <span>
        Edited {formatRelativeTime(updatedAt)} · {wordCount} words
      </span>
    </div>
  );
}
