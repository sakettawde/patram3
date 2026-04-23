export function formatRelativeTime(ts: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
