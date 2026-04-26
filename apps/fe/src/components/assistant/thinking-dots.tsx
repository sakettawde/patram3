export function ThinkingDots() {
  return (
    <div
      role="status"
      aria-label="Thinking"
      className="flex items-center gap-2 py-1 text-[12.5px] text-(--ink-soft)"
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
      <span className="italic">Thinking…</span>
    </div>
  );
}
