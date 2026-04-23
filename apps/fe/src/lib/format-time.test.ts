import { describe, expect, test } from "vite-plus/test";
import { formatRelativeTime } from "./format-time";

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-04-23T12:00:00Z").getTime();

  test("returns 'just now' under 45 seconds", () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 44_000, NOW)).toBe("just now");
  });

  test("returns minutes for 1-59 minutes", () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe("1 min ago");
    expect(formatRelativeTime(NOW - 3 * 60_000, NOW)).toBe("3 min ago");
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe("59 min ago");
  });

  test("returns hours for 1-23 hours", () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe("1 hr ago");
    expect(formatRelativeTime(NOW - 5 * 60 * 60_000, NOW)).toBe("5 hr ago");
  });

  test("returns absolute short date for 24h+", () => {
    const fourDaysAgo = NOW - 4 * 24 * 60 * 60_000;
    expect(formatRelativeTime(fourDaysAgo, NOW)).toMatch(/Apr 19/);
  });
});
