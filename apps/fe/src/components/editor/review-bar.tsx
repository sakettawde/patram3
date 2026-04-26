type Props = {
  count: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
};

export function ReviewBar({ count, onAcceptAll, onRejectAll }: Props) {
  if (count <= 0) return null;
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-(--ink-faint) bg-white/95 px-6 py-2 text-[14px] backdrop-blur">
      <span className="text-(--ink-soft)">
        Agent proposed {count} {count === 1 ? "change" : "changes"}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRejectAll}
          className="rounded border border-(--ink-faint) px-3 py-1 hover:bg-(--ink-faint)/30"
        >
          Reject all
        </button>
        <button
          type="button"
          onClick={onAcceptAll}
          className="rounded bg-(--ink) px-3 py-1 text-white hover:opacity-90"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
