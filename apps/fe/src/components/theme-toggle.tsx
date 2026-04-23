import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "patram.theme";

function resolveInitial(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => resolveInitial());

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-white/70 px-2 py-1 text-[11px] text-[var(--sea-ink-soft)] transition hover:border-[var(--lagoon-deep)]/40 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
    >
      {theme === "dark" ? <Moon className="size-3" /> : <Sun className="size-3" />}
      <span className="font-medium">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
