# Patram Document UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 UI of Patram — a single-page document dashboard with a left sidebar (pinned + all docs) and a Tiptap editor in the center with slash commands and a floating bubble menu. UI-only; state is in-memory (optionally mirrored to `localStorage`).

**Architecture:** React 19 + TanStack Start + Tailwind v4 + shadcn/ui (new-york style, already scaffolded). Zustand for document state. Tiptap 2.x with a custom slash-menu built on `@tiptap/suggestion` + `tippy.js`, the official `@tiptap/extension-bubble-menu`, and a custom `callout` node. Lagoon palette from the existing `styles.css` is reused verbatim.

**Tech Stack:** React 19, TanStack Start/Router, Vite+ (`vp`), Tailwind v4, shadcn/ui, Zustand, Tiptap 2.x, Vitest + React Testing Library, jsdom.

**Reference spec:** [`docs/superpowers/specs/2026-04-23-patram-document-ui-design.md`](../specs/2026-04-23-patram-document-ui-design.md).

---

## File map (new or modified)

**Modify:**

- `apps/fe/src/routes/index.tsx` — swap Home content with `<AppShell/>`.
- `apps/fe/src/styles.css` — add a small set of editor-specific rules (ProseMirror caret, placeholder, callout, slash-menu animation). All inside the existing file, no new CSS files.
- `apps/fe/package.json` — new deps (added via `vp add`).

**Create (app code):**

- `apps/fe/src/components/app-shell.tsx`
- `apps/fe/src/components/sidebar/sidebar.tsx`
- `apps/fe/src/components/sidebar/sidebar-section.tsx`
- `apps/fe/src/components/sidebar/doc-row.tsx`
- `apps/fe/src/components/sidebar/user-chip.tsx`
- `apps/fe/src/components/theme-toggle.tsx`
- `apps/fe/src/components/topbar.tsx`
- `apps/fe/src/components/save-status.tsx`
- `apps/fe/src/components/doc/doc-surface.tsx`
- `apps/fe/src/components/doc/doc-emoji.tsx`
- `apps/fe/src/components/doc/emoji-palette.tsx`
- `apps/fe/src/components/doc/doc-meta.tsx`
- `apps/fe/src/components/editor/editor.tsx`
- `apps/fe/src/components/editor/extensions.ts`
- `apps/fe/src/components/editor/slash-menu.tsx`
- `apps/fe/src/components/editor/slash-commands.ts`
- `apps/fe/src/components/editor/bubble-menu.tsx`
- `apps/fe/src/components/editor/callout-node.tsx`
- `apps/fe/src/components/editor/link-popover.tsx`
- `apps/fe/src/components/editor/turn-into-menu.tsx`
- `apps/fe/src/stores/documents.ts`
- `apps/fe/src/lib/seed-docs.ts`
- `apps/fe/src/lib/format-time.ts`
- `apps/fe/src/lib/shortcut.ts`

**Create (tests):**

- `apps/fe/src/stores/documents.test.ts`
- `apps/fe/src/lib/format-time.test.ts`
- `apps/fe/src/components/app-shell.test.tsx`

**Create (shadcn, generated):**

- `apps/fe/src/components/ui/button.tsx`
- `apps/fe/src/components/ui/input.tsx`
- `apps/fe/src/components/ui/separator.tsx`
- `apps/fe/src/components/ui/tooltip.tsx`
- `apps/fe/src/components/ui/dropdown-menu.tsx`
- `apps/fe/src/components/ui/popover.tsx`
- `apps/fe/src/components/ui/scroll-area.tsx`
- `apps/fe/src/components/ui/avatar.tsx`

---

## Task 0: Verify baseline

Make sure the repo is green before we start.

**Files:**

- None modified.

- [ ] **Step 1: Run the baseline checks**

Run: `vp install && vp check && vp test`
Expected: all pass. Note that `apps/fe/src/routeTree.gen.ts` may show as modified — that's a generated artifact, leave it.

- [ ] **Step 2: Confirm dev server still boots**

Run: `vp run fe#dev` in a separate shell, open `http://localhost:3000`, confirm the current placeholder page renders, then stop the server (`Ctrl+C`).

---

## Task 1: Install dependencies

Install all runtime deps in a single step so subsequent tasks don't re-hit the network.

**Files:**

- Modify: `apps/fe/package.json` (via `vp add` — do not hand-edit).

- [ ] **Step 1: Add Zustand**

Run (from repo root):

```bash
vp add -F fe zustand
```

Expected: `zustand` added to `apps/fe/package.json` dependencies.

- [ ] **Step 2: Add Tiptap core + extensions**

Run:

```bash
vp add -F fe \
  @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-placeholder @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-link @tiptap/extension-highlight @tiptap/extension-underline \
  @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-image \
  @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-character-count @tiptap/extension-bubble-menu \
  @tiptap/suggestion tippy.js
```

Expected: all added to `apps/fe/package.json` dependencies.

- [ ] **Step 3: Add nanoid for doc ids**

Run:

```bash
vp add -F fe nanoid
```

- [ ] **Step 4: Verify dev still boots and types resolve**

Run: `vp check`
Expected: passes (no code added yet — deps only).

- [ ] **Step 5: Commit**

```bash
git add apps/fe/package.json pnpm-lock.yaml
git commit -m "feat(fe): add tiptap, zustand, nanoid dependencies"
```

---

## Task 2: Scaffold shadcn primitives

Generate the shadcn components listed in the spec. `vp dlx` runs the shadcn CLI without installing it.

**Files:**

- Create: `apps/fe/src/components/ui/{button,input,separator,tooltip,dropdown-menu,popover,scroll-area,avatar}.tsx`

- [ ] **Step 1: Run the shadcn generator**

From `apps/fe/`:

```bash
cd apps/fe
vp dlx shadcn@latest add button input separator tooltip dropdown-menu popover scroll-area avatar --yes
cd -
```

Expected: eight files land under `apps/fe/src/components/ui/`. The CLI may also add peer deps (`@radix-ui/*`, `cmdk`, etc.) — let it.

- [ ] **Step 2: Verify**

Run: `vp check`
Expected: passes. If the CLI uses any import path not matching `#/*`, fix it (should be rare — `components.json` already points at `#/components`).

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/ui apps/fe/package.json pnpm-lock.yaml
git commit -m "feat(fe): scaffold shadcn primitives (button, input, dropdown, popover, etc.)"
```

---

## Task 3: Time-formatting helper (TDD)

Relative-time strings are small and worth testing on their own.

**Files:**

- Create: `apps/fe/src/lib/format-time.ts`
- Test: `apps/fe/src/lib/format-time.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/fe/src/lib/format-time.test.ts`:

```ts
import { describe, expect, test, vi } from "vite-plus/test";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test run apps/fe/src/lib/format-time.test.ts`
Expected: FAIL with module-not-found on `./format-time`.

- [ ] **Step 3: Implement the helper**

Create `apps/fe/src/lib/format-time.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test run apps/fe/src/lib/format-time.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/format-time.ts apps/fe/src/lib/format-time.test.ts
git commit -m "feat(fe): add formatRelativeTime helper"
```

---

## Task 4: Shortcut display helper

Tiny utility so `⌘\` on macOS becomes `Ctrl+\` elsewhere.

**Files:**

- Create: `apps/fe/src/lib/shortcut.ts`

- [ ] **Step 1: Write the file**

Create `apps/fe/src/lib/shortcut.ts`:

```ts
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function cmdKey(): string {
  return isMac() ? "⌘" : "Ctrl";
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/fe/src/lib/shortcut.ts
git commit -m "feat(fe): add shortcut display helper"
```

---

## Task 5: Documents store (TDD)

The Zustand store is the only non-trivial piece of state. Test it in isolation.

**Files:**

- Create: `apps/fe/src/stores/documents.ts`
- Test: `apps/fe/src/stores/documents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/fe/src/stores/documents.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createDocumentsStore, type DocumentsStore } from "./documents";
import type { StoreApi } from "zustand";

describe("DocumentsStore", () => {
  let store: StoreApi<DocumentsStore>;

  beforeEach(() => {
    store = createDocumentsStore();
  });

  test("starts empty (when seed=false)", () => {
    const s = createDocumentsStore({ seed: false });
    expect(s.getState().order).toEqual([]);
    expect(s.getState().selectedId).toBeNull();
  });

  test("createDoc adds a doc, selects it, returns id", () => {
    const s = createDocumentsStore({ seed: false });
    const id = s.getState().createDoc();
    expect(s.getState().docs[id]).toBeTruthy();
    expect(s.getState().order).toContain(id);
    expect(s.getState().selectedId).toBe(id);
    expect(s.getState().docs[id].title).toBe("Untitled");
  });

  test("updateDoc patches fields and updates updatedAt", () => {
    const s = createDocumentsStore({ seed: false });
    const id = s.getState().createDoc();
    const before = s.getState().docs[id].updatedAt;
    // ensure at least 1ms passes
    const later = before + 1;
    s.getState().updateDoc(id, { title: "Hello", wordCount: 3 }, later);
    expect(s.getState().docs[id].title).toBe("Hello");
    expect(s.getState().docs[id].wordCount).toBe(3);
    expect(s.getState().docs[id].updatedAt).toBe(later);
  });

  test("pinDoc toggles pinned flag", () => {
    const s = createDocumentsStore({ seed: false });
    const id = s.getState().createDoc();
    expect(s.getState().docs[id].pinned).toBe(false);
    s.getState().pinDoc(id, true);
    expect(s.getState().docs[id].pinned).toBe(true);
    s.getState().pinDoc(id, false);
    expect(s.getState().docs[id].pinned).toBe(false);
  });

  test("deleteDoc removes from order and clears selection if selected", () => {
    const s = createDocumentsStore({ seed: false });
    const a = s.getState().createDoc();
    const b = s.getState().createDoc();
    s.getState().selectDoc(a);
    s.getState().deleteDoc(a);
    expect(s.getState().docs[a]).toBeUndefined();
    expect(s.getState().order).toEqual([b]);
    expect(s.getState().selectedId).toBe(b);
  });

  test("deleteDoc on last doc leaves selectedId null", () => {
    const s = createDocumentsStore({ seed: false });
    const id = s.getState().createDoc();
    s.getState().deleteDoc(id);
    expect(s.getState().selectedId).toBeNull();
  });

  test("renameDoc falls back to 'Untitled' on empty", () => {
    const s = createDocumentsStore({ seed: false });
    const id = s.getState().createDoc();
    s.getState().renameDoc(id, "  ");
    expect(s.getState().docs[id].title).toBe("Untitled");
    s.getState().renameDoc(id, "Real title");
    expect(s.getState().docs[id].title).toBe("Real title");
  });

  test("setEmoji updates emoji", () => {
    const s = createDocumentsStore({ seed: false });
    const id = s.getState().createDoc();
    s.getState().setEmoji(id, "🌊");
    expect(s.getState().docs[id].emoji).toBe("🌊");
  });

  test("seeds four docs by default and selects the last one", () => {
    const s = createDocumentsStore();
    expect(s.getState().order.length).toBe(4);
    expect(s.getState().selectedId).toBe(s.getState().order[s.getState().order.length - 1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `vp test run apps/fe/src/stores/documents.test.ts`
Expected: FAIL with module-not-found on `./documents`.

- [ ] **Step 3: Write the store (without seed for now — seed function is injected)**

Create `apps/fe/src/stores/documents.ts`:

```ts
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { nanoid } from "nanoid";
import type { JSONContent } from "@tiptap/react";
import { seedDocuments } from "#/lib/seed-docs";

export type Doc = {
  id: string;
  title: string;
  emoji: string;
  tag: string | null;
  contentJson: JSONContent;
  wordCount: number;
  updatedAt: number;
  pinned: boolean;
};

export type DocumentsState = {
  docs: Record<string, Doc>;
  order: string[];
  selectedId: string | null;
};

export type DocumentsActions = {
  createDoc: () => string;
  updateDoc: (id: string, patch: Partial<Doc>, updatedAt?: number) => void;
  pinDoc: (id: string, pinned: boolean) => void;
  deleteDoc: (id: string) => void;
  selectDoc: (id: string) => void;
  renameDoc: (id: string, title: string) => void;
  setEmoji: (id: string, emoji: string) => void;
};

export type DocumentsStore = DocumentsState & DocumentsActions;

const emptyDoc = (): Doc => ({
  id: nanoid(8),
  title: "Untitled",
  emoji: "📝",
  tag: null,
  contentJson: { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
  wordCount: 0,
  updatedAt: Date.now(),
  pinned: false,
});

export function createDocumentsStore(opts: { seed?: boolean } = {}): StoreApi<DocumentsStore> {
  const seed = opts.seed ?? true;
  return createStore<DocumentsStore>((set, get) => {
    const initial: DocumentsState = seed
      ? seedDocuments()
      : { docs: {}, order: [], selectedId: null };

    return {
      ...initial,

      createDoc: () => {
        const d = emptyDoc();
        set((st) => ({
          docs: { ...st.docs, [d.id]: d },
          order: [...st.order, d.id],
          selectedId: d.id,
        }));
        return d.id;
      },

      updateDoc: (id, patch, updatedAt) => {
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          const next: Doc = { ...existing, ...patch, updatedAt: updatedAt ?? Date.now() };
          return { docs: { ...st.docs, [id]: next } };
        });
      },

      pinDoc: (id, pinned) => {
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          return { docs: { ...st.docs, [id]: { ...existing, pinned } } };
        });
      },

      deleteDoc: (id) => {
        set((st) => {
          if (!st.docs[id]) return st;
          const nextDocs = { ...st.docs };
          delete nextDocs[id];
          const nextOrder = st.order.filter((x) => x !== id);
          const nextSelected =
            st.selectedId === id ? (nextOrder[nextOrder.length - 1] ?? null) : st.selectedId;
          return { docs: nextDocs, order: nextOrder, selectedId: nextSelected };
        });
      },

      selectDoc: (id) => {
        if (!get().docs[id]) return;
        set({ selectedId: id });
      },

      renameDoc: (id, title) => {
        const clean = title.trim();
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          return {
            docs: {
              ...st.docs,
              [id]: { ...existing, title: clean === "" ? "Untitled" : clean },
            },
          };
        });
      },

      setEmoji: (id, emoji) => {
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          return { docs: { ...st.docs, [id]: { ...existing, emoji } } };
        });
      },
    };
  });
}

// Singleton used by the app
export const documentsStore = createDocumentsStore();

export function useDocuments<T>(selector: (s: DocumentsStore) => T): T {
  return useStore(documentsStore, selector);
}
```

Also create a placeholder seed module so the import resolves:

Create `apps/fe/src/lib/seed-docs.ts`:

```ts
import type { DocumentsState } from "#/stores/documents";

// Real seed content arrives in Task 6. Empty until then.
export function seedDocuments(): DocumentsState {
  return { docs: {}, order: [], selectedId: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test run apps/fe/src/stores/documents.test.ts`
Expected: the eight non-seed tests PASS. The last test ("seeds four docs by default") will FAIL — that's expected, it's covered by Task 6.

- [ ] **Step 5: Skip the seed test for now**

Edit the test in `documents.test.ts`: change `test("seeds four docs by default..."` to `test.skip("seeds four docs by default..."`. We'll un-skip in Task 6.

Run: `vp test run apps/fe/src/stores/documents.test.ts`
Expected: 8 pass, 1 skipped.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/stores/documents.ts apps/fe/src/stores/documents.test.ts apps/fe/src/lib/seed-docs.ts
git commit -m "feat(fe): add documents store (zustand) with tests"
```

---

## Task 6: Seed documents

Populate four seed docs so the UI feels alive on first load.

**Files:**

- Modify: `apps/fe/src/lib/seed-docs.ts`
- Modify: `apps/fe/src/stores/documents.test.ts` (unskip the seed test)

- [ ] **Step 1: Write the seed module**

Replace `apps/fe/src/lib/seed-docs.ts` with:

```ts
import type { JSONContent } from "@tiptap/react";
import type { Doc, DocumentsState } from "#/stores/documents";
import { nanoid } from "nanoid";

function heading(level: 1 | 2 | 3, text: string): JSONContent {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function task(text: string, checked = false): JSONContent {
  return {
    type: "taskItem",
    attrs: { checked },
    content: [para(text)],
  };
}
function tasks(items: Array<{ text: string; done?: boolean }>): JSONContent {
  return { type: "taskList", content: items.map((i) => task(i.text, i.done ?? false)) };
}
function bullet(items: string[]): JSONContent {
  return {
    type: "bulletList",
    content: items.map((t) => ({ type: "listItem", content: [para(t)] })),
  };
}
function quote(text: string): JSONContent {
  return { type: "blockquote", content: [para(text)] };
}
function callout(emoji: string, text: string): JSONContent {
  return {
    type: "callout",
    attrs: { emoji },
    content: [para(text)],
  };
}

function doc(partial: Partial<Doc> & Pick<Doc, "title" | "emoji" | "contentJson">): Doc {
  return {
    id: nanoid(8),
    title: partial.title,
    emoji: partial.emoji,
    tag: partial.tag ?? null,
    contentJson: partial.contentJson,
    wordCount: partial.wordCount ?? 0,
    updatedAt: partial.updatedAt ?? Date.now(),
    pinned: partial.pinned ?? false,
  };
}

export function seedDocuments(): DocumentsState {
  const now = Date.now();
  const list: Doc[] = [
    doc({
      title: "Onboarding notes",
      emoji: "🌿",
      pinned: true,
      tag: "guide",
      updatedAt: now - 60 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Onboarding notes"),
          para("Welcome to Patram. These notes collect the little rituals we keep returning to."),
          heading(2, "First week"),
          tasks([
            { text: "Read the product principles", done: true },
            { text: "Pair with a teammate on a real ticket" },
            { text: "Write your first retro" },
          ]),
        ],
      },
    }),
    doc({
      title: "Product principles",
      emoji: "📐",
      pinned: true,
      tag: "values",
      updatedAt: now - 3 * 60 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Product principles"),
          quote("Ship calm software. The fewer surprises, the better."),
          bullet([
            "Respect the reader’s attention.",
            "Defaults should make the next sentence easier.",
            "Small delights, never loud ones.",
          ]),
        ],
      },
    }),
    doc({
      title: "Retro — April",
      emoji: "📝",
      tag: "retro",
      updatedAt: now - 20 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Retro — April"),
          heading(2, "Went well"),
          tasks([
            { text: "Landed the slash menu prototype", done: true },
            { text: "Found a cleaner approach for the bubble menu", done: true },
          ]),
          heading(2, "To improve"),
          tasks([{ text: "Cut scope earlier when a week slips" }]),
          callout("💡", "The fastest improvement is often the one you already agreed to."),
        ],
      },
    }),
    doc({
      title: "Q2 planning",
      emoji: "🌊",
      tag: "planning",
      updatedAt: now - 2 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Q2 planning"),
          para(
            "This is the space where the team drafts the plan for the next quarter. The writing experience stays out of your way — there is no toolbar above. Select any text to reveal a floating bubble menu, or hit / on a new line for the slash menu.",
          ),
          callout("💡", "Goal. Ship the document editor before the planning offsite on April 30."),
          heading(2, "Top priorities"),
          tasks([
            { text: "Confirm the palette and typography direction", done: true },
            { text: "Wire slash commands for headings, lists, quote, callout" },
            { text: "Design the empty state" },
          ]),
          heading(2, "Open questions"),
          para(""),
        ],
      },
    }),
  ];

  const docs: Record<string, Doc> = {};
  const order: string[] = [];
  for (const d of list) {
    docs[d.id] = d;
    order.push(d.id);
  }
  return { docs, order, selectedId: order[order.length - 1] ?? null };
}
```

- [ ] **Step 2: Un-skip the seed test**

Edit `apps/fe/src/stores/documents.test.ts`: change `test.skip("seeds four docs by default...` back to `test("seeds four docs by default...`.

- [ ] **Step 3: Run tests**

Run: `vp test run apps/fe/src/stores/documents.test.ts`
Expected: 9 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/lib/seed-docs.ts apps/fe/src/stores/documents.test.ts
git commit -m "feat(fe): seed four starter documents"
```

---

## Task 7: Theme toggle

Standalone so we can drop it anywhere. Toggles `.dark` on `<html>` and remembers in `localStorage` under `patram.theme`.

**Files:**

- Create: `apps/fe/src/components/theme-toggle.tsx`

- [ ] **Step 1: Write the component**

Create `apps/fe/src/components/theme-toggle.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/fe/src/components/theme-toggle.tsx
git commit -m "feat(fe): add theme toggle"
```

---

## Task 8: Sidebar components

Composed out of small files per the file map.

**Files:**

- Create: `apps/fe/src/components/sidebar/sidebar-section.tsx`
- Create: `apps/fe/src/components/sidebar/doc-row.tsx`
- Create: `apps/fe/src/components/sidebar/user-chip.tsx`
- Create: `apps/fe/src/components/sidebar/sidebar.tsx`

- [ ] **Step 1: SidebarSection**

Create `apps/fe/src/components/sidebar/sidebar-section.tsx`:

```tsx
import type { ReactNode } from "react";

export function SidebarSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="mt-2">
      <header className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[10.5px] font-bold tracking-[0.16em] text-[color:rgb(23_58_64_/_0.55)] uppercase">
          {label}
        </span>
        {count !== undefined && (
          <span className="text-[11px] text-[color:rgb(23_58_64_/_0.5)]">{count}</span>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: DocRow**

Create `apps/fe/src/components/sidebar/doc-row.tsx`:

```tsx
import { Star } from "lucide-react";
import { cn } from "#/lib/utils";

export function DocRow({
  emoji,
  title,
  pinned,
  active,
  onClick,
}: {
  emoji: string;
  title: string;
  pinned: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mx-2 my-0.5 flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition",
        active
          ? "border border-[color:rgb(79_184_178_/_0.35)] bg-[color:rgb(79_184_178_/_0.18)] px-[9px] py-[6px] text-[var(--sea-ink)]"
          : "text-[color:rgb(42_74_80)] hover:bg-[color:rgb(79_184_178_/_0.1)] hover:shadow-[0_0_0_1px_rgb(79_184_178_/_0.25)]",
      )}
    >
      <span className="w-[18px] text-center">{emoji}</span>
      <span className="truncate">{title}</span>
      {pinned && <Star className="ml-auto size-3 fill-current text-[var(--lagoon-deep)]" />}
    </button>
  );
}
```

- [ ] **Step 3: UserChip**

Create `apps/fe/src/components/sidebar/user-chip.tsx`:

```tsx
import { ThemeToggle } from "#/components/theme-toggle";

export function UserChip({ name, email }: { name: string; email: string }) {
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--line)] px-3 py-2.5">
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
      <ThemeToggle />
    </div>
  );
}
```

- [ ] **Step 4: Sidebar**

Create `apps/fe/src/components/sidebar/sidebar.tsx`:

```tsx
import { Plus, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useDocuments } from "#/stores/documents";
import { cmdKey } from "#/lib/shortcut";
import { SidebarSection } from "./sidebar-section";
import { DocRow } from "./doc-row";
import { UserChip } from "./user-chip";
import { cn } from "#/lib/utils";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const order = useDocuments((s) => s.order);
  const docs = useDocuments((s) => s.docs);
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const createDoc = useDocuments((s) => s.createDoc);

  const pinned = order.filter((id) => docs[id]?.pinned);
  const rest = order.filter((id) => !docs[id]?.pinned);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-[var(--line)] bg-gradient-to-b from-white/92 to-[color:rgb(243_250_245_/_0.86)] transition-[width] duration-200",
        collapsed ? "w-[56px]" : "w-[264px]",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        {!collapsed && (
          <div className="flex items-center gap-2 font-['Fraunces',Georgia,serif] text-[17px] font-bold tracking-tight text-[var(--sea-ink)]">
            <span
              aria-hidden
              className="inline-block size-[18px] rounded-md bg-gradient-to-br from-[var(--lagoon)] to-[var(--palm)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
            />
            Patram
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex size-[26px] items-center justify-center rounded-lg border border-[var(--line)] bg-white/60 text-[var(--sea-ink-soft)] hover:bg-white"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-3.5" />
          ) : (
            <PanelLeftClose className="size-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mx-3 mt-1 mb-2.5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white/80 px-2.5 py-2 text-[12px] text-[var(--sea-ink-soft)]">
            <Search className="size-3.5" />
            <span className="flex-1">Search documents</span>
            <span className="rounded border border-[var(--line)] bg-[color:rgb(23_58_64_/_0.06)] px-1.5 py-[1px] text-[10px]">
              {cmdKey()}K
            </span>
          </div>

          <button
            type="button"
            onClick={() => createDoc()}
            className="mx-3 mb-3.5 flex items-center gap-2 rounded-lg bg-gradient-to-b from-[var(--lagoon)] to-[var(--lagoon-deep)] px-3 py-2 text-[13px] font-semibold text-white shadow-[0_6px_14px_rgb(50_143_151_/_0.28),inset_0_1px_0_rgb(255_255_255_/_0.3)] transition hover:brightness-105"
          >
            <span className="inline-flex size-[18px] items-center justify-center rounded-md bg-white/25">
              <Plus className="size-3.5" />
            </span>
            New document
          </button>

          {pinned.length > 0 && (
            <SidebarSection label="Pinned" count={pinned.length}>
              {pinned.map((id) => {
                const d = docs[id];
                if (!d) return null;
                return (
                  <DocRow
                    key={id}
                    emoji={d.emoji}
                    title={d.title}
                    pinned
                    active={selectedId === id}
                    onClick={() => selectDoc(id)}
                  />
                );
              })}
            </SidebarSection>
          )}

          <SidebarSection label="All documents" count={rest.length}>
            {rest.map((id) => {
              const d = docs[id];
              if (!d) return null;
              return (
                <DocRow
                  key={id}
                  emoji={d.emoji}
                  title={d.title}
                  pinned={false}
                  active={selectedId === id}
                  onClick={() => selectDoc(id)}
                />
              );
            })}
          </SidebarSection>

          <UserChip name="Saket" email="saket.tawde@in.artofliving.org" />
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Verify it type-checks**

Run: `vp check`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/components/sidebar
git commit -m "feat(fe): sidebar with pinned + all documents sections"
```

---

## Task 9: Topbar with save-status + overflow

**Files:**

- Create: `apps/fe/src/components/save-status.tsx`
- Create: `apps/fe/src/components/topbar.tsx`

- [ ] **Step 1: SaveStatus**

Create `apps/fe/src/components/save-status.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { formatRelativeTime } from "#/lib/format-time";

export function SaveStatus({ state, savedAt }: { state: "idle" | "saving"; savedAt: number }) {
  const [, force] = useState(0);

  // re-render once per minute to update the "X min ago" label
  useEffect(() => {
    const iv = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  const label = state === "saving" ? "Saving…" : `Saved · ${formatRelativeTime(savedAt)}`;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:rgb(79_184_178_/_0.12)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--lagoon-deep)]">
      {state === "saving" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className="inline-flex size-3 items-center justify-center rounded-full bg-[var(--lagoon)] text-[8px] text-white">
          <Check className="size-2" />
        </span>
      )}
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Topbar**

Create `apps/fe/src/components/topbar.tsx`:

```tsx
import { MoreHorizontal, Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useDocuments } from "#/stores/documents";
import { SaveStatus } from "#/components/save-status";
import { cn } from "#/lib/utils";

export function Topbar({ saveState }: { saveState: "idle" | "saving" }) {
  const selectedId = useDocuments((s) => s.selectedId);
  const doc = useDocuments((s) => (s.selectedId ? s.docs[s.selectedId] : null));
  const pinDoc = useDocuments((s) => s.pinDoc);
  const deleteDoc = useDocuments((s) => s.deleteDoc);

  if (!doc || !selectedId) return <header className="h-[44px] border-b border-[var(--line)]" />;

  return (
    <header className="flex h-[44px] items-center gap-2.5 border-b border-[var(--line)] px-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-[12px] text-[var(--sea-ink-soft)]"
      >
        <span>All documents</span>
        <span className="opacity-40">/</span>
        <span className="font-semibold text-[var(--sea-ink)]">{doc.title}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <SaveStatus state={saveState} savedAt={doc.updatedAt} />
        <button
          type="button"
          aria-label={doc.pinned ? "Unpin document" : "Pin document"}
          onClick={() => pinDoc(selectedId, !doc.pinned)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white/70 text-[var(--sea-ink-soft)] hover:bg-white",
            doc.pinned && "text-[var(--lagoon-deep)]",
          )}
        >
          <Star className={cn("size-3.5", doc.pinned && "fill-current")} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="inline-flex size-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white/70 text-[var(--sea-ink-soft)] hover:bg-white"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem disabled>Duplicate</DropdownMenuItem>
            <DropdownMenuItem disabled>Change icon</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => deleteDoc(selectedId)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Type check**

Run: `vp check`
Expected: passes. If the shadcn `DropdownMenuItem` type does not accept `variant`, drop that prop and add `className="text-destructive"`.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/save-status.tsx apps/fe/src/components/topbar.tsx
git commit -m "feat(fe): topbar with save status and overflow actions"
```

---

## Task 10: Doc surface — emoji, meta, content frame

Editor component is a stub for now; filled in Task 11.

**Files:**

- Create: `apps/fe/src/components/doc/emoji-palette.tsx`
- Create: `apps/fe/src/components/doc/doc-emoji.tsx`
- Create: `apps/fe/src/components/doc/doc-meta.tsx`
- Create: `apps/fe/src/components/doc/doc-surface.tsx`
- Create: `apps/fe/src/components/editor/editor.tsx` (stub)

- [ ] **Step 1: EmojiPalette**

Create `apps/fe/src/components/doc/emoji-palette.tsx`:

```tsx
const EMOJIS = [
  "📝",
  "🌊",
  "🌿",
  "📐",
  "💡",
  "🗒️",
  "📖",
  "🎯",
  "🧭",
  "🏖️",
  "🪴",
  "🧪",
  "🔭",
  "🗂️",
  "🕯️",
  "🧩",
  "🔖",
  "📎",
  "✍️",
  "☕",
  "🎨",
  "🧵",
  "🌱",
  "⚓",
];

export function EmojiPalette({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1 p-2">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="aspect-square rounded-md text-xl transition hover:bg-[color:rgb(79_184_178_/_0.14)] active:scale-90"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: DocEmoji**

Create `apps/fe/src/components/doc/doc-emoji.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { EmojiPalette } from "./emoji-palette";

export function DocEmoji({ emoji, onChange }: { emoji: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [spring, setSpring] = useState(false);

  // trigger spring animation when emoji prop changes
  useEffect(() => {
    setSpring(true);
    const t = window.setTimeout(() => setSpring(false), 200);
    return () => window.clearTimeout(t);
  }, [emoji]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change document icon"
          className="mb-3.5 inline-block rounded-lg px-2 text-[42px] leading-none transition hover:bg-[color:rgb(79_184_178_/_0.1)]"
          style={{
            transform: spring ? "scale(1)" : undefined,
            animation: spring ? "emoji-spring 180ms cubic-bezier(0.34,1.56,0.64,1)" : undefined,
          }}
        >
          {emoji}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <EmojiPalette
          onPick={(e) => {
            onChange(e);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: DocMeta**

Create `apps/fe/src/components/doc/doc-meta.tsx`:

```tsx
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
```

- [ ] **Step 4: Editor stub**

Create `apps/fe/src/components/editor/editor.tsx` (full implementation lands in Task 11):

```tsx
import type { JSONContent } from "@tiptap/react";

export type EditorProps = {
  docId: string;
  initialContent: JSONContent;
  onUpdate: (args: { json: JSONContent; wordCount: number; title: string }) => void;
  onSavingChange: (saving: boolean) => void;
};

export function Editor(_: EditorProps) {
  return (
    <div className="min-h-[40vh] text-[var(--sea-ink-soft)] italic">
      Editor placeholder — implemented in Task 11.
    </div>
  );
}
```

- [ ] **Step 5: DocSurface**

Create `apps/fe/src/components/doc/doc-surface.tsx`:

```tsx
import { useDocuments } from "#/stores/documents";
import { DocEmoji } from "./doc-emoji";
import { DocMeta } from "./doc-meta";
import { Editor } from "#/components/editor/editor";

export function DocSurface({ onSavingChange }: { onSavingChange: (saving: boolean) => void }) {
  const doc = useDocuments((s) => (s.selectedId ? s.docs[s.selectedId] : null));
  const setEmoji = useDocuments((s) => s.setEmoji);
  const updateDoc = useDocuments((s) => s.updateDoc);
  const renameDoc = useDocuments((s) => s.renameDoc);

  if (!doc) {
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-24 text-center text-[var(--sea-ink-soft)]">
        <div className="mb-3 text-[42px]">🌊</div>
        <p className="font-['Fraunces',Georgia,serif] text-2xl text-[var(--sea-ink)]">
          Nothing selected yet
        </p>
        <p className="mt-2 text-sm italic opacity-80">
          Pick a document on the left, or create a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[680px] px-6 pt-14 pb-20">
      <DocEmoji emoji={doc.emoji} onChange={(e) => setEmoji(doc.id, e)} />
      <DocMeta tag={doc.tag} updatedAt={doc.updatedAt} wordCount={doc.wordCount} />
      <Editor
        docId={doc.id}
        initialContent={doc.contentJson}
        onUpdate={({ json, wordCount, title }) => {
          updateDoc(doc.id, { contentJson: json, wordCount });
          renameDoc(doc.id, title);
        }}
        onSavingChange={onSavingChange}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `vp check`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add apps/fe/src/components/doc apps/fe/src/components/editor/editor.tsx
git commit -m "feat(fe): doc surface scaffold (emoji, meta, editor stub)"
```

---

## Task 11: AppShell + route swap

Assemble the layout and wire it to the route. Also inject a `⌘\` global keyboard listener for sidebar collapse.

**Files:**

- Create: `apps/fe/src/components/app-shell.tsx`
- Modify: `apps/fe/src/routes/index.tsx`

- [ ] **Step 1: AppShell**

Create `apps/fe/src/components/app-shell.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Sidebar } from "#/components/sidebar/sidebar";
import { Topbar } from "#/components/topbar";
import { DocSurface } from "#/components/doc/doc-surface";

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 960;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid h-screen w-screen grid-cols-[auto_1fr] overflow-hidden bg-white">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
      <main className="flex h-screen flex-col overflow-hidden">
        <Topbar saveState={saving ? "saving" : "idle"} />
        <div className="flex-1 overflow-y-auto">
          <DocSurface onSavingChange={setSaving} />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Swap the route**

Replace `apps/fe/src/routes/index.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";

export const Route = createFileRoute("/")({ component: AppShell });
```

- [ ] **Step 3: Boot the app**

Run: `vp run fe#dev` in a separate shell.
Open `http://localhost:3000`.
Expected:

- Sidebar on left with four seed docs ("Q2 planning" selected).
- Topbar shows breadcrumb "All documents / Q2 planning" and a "Saved · just now" chip.
- Doc surface shows emoji 🌊, Fraunces H1 "Q2 planning", tag chip, meta row, and the editor placeholder ("Editor placeholder — implemented in Task 11.").
- Click "+ New document" → a new Untitled doc is created and selected.
- Click a pinned doc → selection moves.
- `⌘\` collapses/expands the sidebar.

Stop the server before moving on.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/app-shell.tsx apps/fe/src/routes/index.tsx
git commit -m "feat(fe): assemble app shell and swap into index route"
```

---

## Task 12: Editor — baseline Tiptap (no slash/bubble yet)

Before wiring the menus, get the editor itself rendering, producing content, and calling `onUpdate` with the debounced save payload.

**Files:**

- Create: `apps/fe/src/components/editor/extensions.ts`
- Modify: `apps/fe/src/components/editor/editor.tsx`
- Modify: `apps/fe/src/styles.css` (add editor prose styles)

- [ ] **Step 1: Verify the current Tiptap API**

Run: `npx ctx7@latest library tiptap "useEditor configuration and extensions in react"`
Pick the closest match (likely `/ueberdosis/tiptap`), then:

```bash
npx ctx7@latest docs <libraryId> "Tiptap React useEditor with StarterKit, Placeholder, TaskList, TaskItem, Link, Highlight, TextStyle, Color, Image, Table, CharacterCount, Underline — current v2 API"
```

Use the fetched docs for any API tweaks below. Do not silently skip this step — the Tiptap React import surface has shifted across minor versions.

- [ ] **Step 2: Write the extensions module**

Create `apps/fe/src/components/editor/extensions.ts`:

```ts
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import CharacterCount from "@tiptap/extension-character-count";
import type { Extensions } from "@tiptap/react";

export function buildExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Placeholder.configure({
      showOnlyCurrent: false,
      placeholder: ({ node, pos }) => {
        if (node.type.name === "heading" && node.attrs.level === 1 && pos === 0) {
          return "Untitled — but full of potential";
        }
        if (node.type.name === "paragraph") {
          return "Press / to conjure a block, or just start writing.";
        }
        return "";
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    Highlight.configure({ multicolor: false }),
    Underline,
    TextStyle,
    Color,
    Image,
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    CharacterCount,
  ];
}
```

- [ ] **Step 3: Implement the Editor**

Replace `apps/fe/src/components/editor/editor.tsx`:

```tsx
import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { buildExtensions } from "./extensions";

const SAVE_DEBOUNCE_MS = 600;

export type EditorProps = {
  docId: string;
  initialContent: JSONContent;
  onUpdate: (args: { json: JSONContent; wordCount: number; title: string }) => void;
  onSavingChange: (saving: boolean) => void;
};

function extractTitle(json: JSONContent): string {
  const first = json.content?.[0];
  if (first?.type === "heading" && first.attrs?.level === 1) {
    const text = (first.content ?? [])
      .map((n) => (n.type === "text" ? (n.text ?? "") : ""))
      .join("")
      .trim();
    return text;
  }
  return "";
}

export function Editor({ docId, initialContent, onUpdate, onSavingChange }: EditorProps) {
  const extensions = useMemo(() => buildExtensions(), []);
  const saveTimer = useRef<number | null>(null);

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      autofocus: "end",
      editorProps: {
        attributes: {
          class:
            "prose prose-slate max-w-none focus:outline-none text-[15.5px] leading-[1.7] text-[color:rgb(33_74_80)]",
        },
      },
      onUpdate: ({ editor }) => {
        onSavingChange(true);
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          const json = editor.getJSON();
          const title = extractTitle(json);
          const wordCount = editor.storage.characterCount?.words?.() ?? 0;
          onUpdate({ json, wordCount, title });
          onSavingChange(false);
        }, SAVE_DEBOUNCE_MS);
      },
    },
    [docId], // rebuild editor when the selected doc changes
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
```

- [ ] **Step 4: Add editor CSS**

Append to `apps/fe/src/styles.css` (end of file):

```css
.ProseMirror {
  caret-color: var(--lagoon);
  min-height: 40vh;
}
.ProseMirror:focus {
  outline: none;
}
.ProseMirror h1 {
  font-family: "Fraunces", Georgia, serif;
  font-weight: 700;
  font-size: 38px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--sea-ink);
  margin: 0 0 10px;
}
.ProseMirror h2 {
  font-family: "Fraunces", Georgia, serif;
  font-size: 22px;
  color: var(--sea-ink);
  margin: 26px 0 10px;
  letter-spacing: -0.01em;
}
.ProseMirror h3 {
  font-family: "Fraunces", Georgia, serif;
  font-size: 18px;
  color: var(--sea-ink);
  margin: 20px 0 8px;
}
.ProseMirror p {
  margin: 0 0 16px;
}
.ProseMirror ul,
.ProseMirror ol {
  padding-left: 20px;
}
.ProseMirror blockquote {
  border-left: 3px solid var(--lagoon);
  padding-left: 14px;
  color: var(--sea-ink-soft);
  font-style: italic;
}
.ProseMirror mark {
  background: rgba(79, 184, 178, 0.25);
  padding: 1px 3px;
  border-radius: 3px;
}
.ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}
.ProseMirror ul[data-type="taskList"] li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 4px 0;
}
.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
  margin-top: 6px;
}

.ProseMirror p.is-editor-empty:first-child::before,
.ProseMirror h1.is-empty::before,
.ProseMirror p.is-empty::before {
  color: var(--sea-ink-soft);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  font-style: italic;
  opacity: 0.6;
}
```

- [ ] **Step 5: Boot and verify**

Run: `vp run fe#dev`
In the browser:

- Q2 planning renders full content (H1, paragraph, callout will still show as raw JSON since the callout node isn't installed yet — that's Task 15).
- Typing in the body updates the topbar save chip: "Saving…" → "Saved · just now" after ~600ms.
- Changing the H1 updates the sidebar row title after the debounce.
- Word count in the meta row updates after the debounce.

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/components/editor apps/fe/src/styles.css
git commit -m "feat(fe): tiptap editor baseline with placeholder + save debounce"
```

---

## Task 13: Bubble menu

**Files:**

- Create: `apps/fe/src/components/editor/link-popover.tsx`
- Create: `apps/fe/src/components/editor/turn-into-menu.tsx`
- Create: `apps/fe/src/components/editor/bubble-menu.tsx`
- Modify: `apps/fe/src/components/editor/editor.tsx`

- [ ] **Step 1: LinkPopover**

Create `apps/fe/src/components/editor/link-popover.tsx`:

```tsx
import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Link as LinkIcon } from "lucide-react";

export function LinkPopover({ editor }: { editor: Editor }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/90 hover:bg-white/10"
        >
          <LinkIcon className="size-3" /> Link
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() === "") {
              editor.chain().focus().unsetLink().run();
            } else {
              editor.chain().focus().setLink({ href: url.trim() }).run();
            }
            setUrl("");
            setOpen(false);
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--lagoon-deep)]"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--lagoon-deep)] px-2 py-1 text-xs font-semibold text-white"
          >
            Set
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: TurnIntoMenu**

Create `apps/fe/src/components/editor/turn-into-menu.tsx`:

```tsx
import type { Editor } from "@tiptap/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

export function TurnIntoMenu({ editor }: { editor: Editor }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-white/90 hover:bg-white/10"
        >
          Turn into ▾
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
          Paragraph
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          Heading 1
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          Heading 2
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          Heading 3
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleBlockquote().run()}>
          Quote
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: BubbleMenu**

Create `apps/fe/src/components/editor/bubble-menu.tsx`:

```tsx
import { BubbleMenu as TiptapBubbleMenu, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIc,
  Strikethrough,
  Code,
  Highlighter,
} from "lucide-react";
import { cn } from "#/lib/utils";
import { LinkPopover } from "./link-popover";
import { TurnIntoMenu } from "./turn-into-menu";

const COLORS: Array<{ label: string; value: string | null }> = [
  { label: "Ink", value: null },
  { label: "Lagoon", value: "#328f97" },
  { label: "Palm", value: "#2f6a4a" },
  { label: "Amber", value: "#b8742a" },
  { label: "Plum", value: "#7a4a8f" },
];

export function BubbleMenu({ editor }: { editor: Editor }) {
  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: "top" }}
      shouldShow={({ editor, from, to }) => {
        if (!editor.isEditable) return false;
        return from !== to;
      }}
    >
      <div className="flex items-center gap-0.5 rounded-lg bg-[#0f2e33] p-1 text-xs text-[#eaf7f4] shadow-[0_14px_34px_rgba(15,46,51,0.35)]">
        <Btn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
        >
          <UnderlineIc className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Strikethrough"
        >
          <Strikethrough className="size-3.5" />
        </Btn>
        <Sep />
        <Btn
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          aria-label="Inline code"
        >
          <Code className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          aria-label="Highlight"
        >
          <Highlighter className="size-3.5" />
        </Btn>
        <ColorPicker editor={editor} />
        <Sep />
        <LinkPopover editor={editor} />
        <TurnIntoMenu editor={editor} />
      </div>
    </TiptapBubbleMenu>
  );
}

function Btn({
  children,
  onClick,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn(
        "rounded-md px-2 py-1 hover:bg-white/10",
        active && "bg-[color:rgb(79_184_178_/_0.22)] text-[color:rgb(194_240_236)]",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div aria-hidden className="mx-0.5 my-1 w-px bg-white/15" />;
}

function ColorPicker({ editor }: { editor: Editor }) {
  return (
    <div className="group relative">
      <button type="button" className="rounded-md px-2 py-1 hover:bg-white/10">
        A▾
      </button>
      <div className="invisible absolute top-full left-0 z-10 mt-1 flex rounded-md bg-[#0f2e33] p-1 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        {COLORS.map((c) => (
          <button
            key={c.label}
            type="button"
            aria-label={c.label}
            onClick={() => {
              if (c.value === null) editor.chain().focus().unsetColor().run();
              else editor.chain().focus().setColor(c.value).run();
            }}
            className="mx-0.5 size-5 rounded-full border border-white/20"
            style={{ background: c.value ?? "var(--sea-ink)" }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render BubbleMenu inside Editor**

Modify `apps/fe/src/components/editor/editor.tsx` — replace the final return with:

```tsx
  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
```

Add the import at the top:

```tsx
import { BubbleMenu } from "./bubble-menu";
```

- [ ] **Step 5: Verify in dev**

Run: `vp run fe#dev`

- Select a run of text: the bubble menu appears above it.
- Toggle bold/italic/underline/strike/code/highlight — each reflects in the selection and button active-state.
- Color picker sets text color; "Ink" clears it.
- Link popover wraps the selection in a link.
- "Turn into" menu converts the block between paragraph / H1 / H2 / H3 / quote.

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/components/editor
git commit -m "feat(fe): floating bubble menu for inline formatting"
```

---

## Task 14: Slash menu

Custom `@tiptap/suggestion`-based command list rendered in a `tippy.js` instance.

**Files:**

- Create: `apps/fe/src/components/editor/slash-commands.ts`
- Create: `apps/fe/src/components/editor/slash-menu.tsx`
- Modify: `apps/fe/src/components/editor/extensions.ts`
- Modify: `apps/fe/src/styles.css` (animation)

- [ ] **Step 1: Verify the suggestion API**

Run: `npx ctx7@latest docs /ueberdosis/tiptap "Suggestion extension with tippy.js in React — current v2 API, startOfLine, char, command signature, items array"`

Use the fetched API shape. The code below follows the pattern that has been stable since Tiptap 2.1; adjust if the fetched docs show a newer idiom.

- [ ] **Step 2: Commands table**

Create `apps/fe/src/components/editor/slash-commands.ts`:

````ts
import type { Editor, Range } from "@tiptap/react";

export type SlashCommand = {
  key: string;
  title: string;
  description: string;
  shortcut?: string;
  icon: string;
  run: (editor: Editor, range: Range) => void;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    key: "h1",
    title: "Heading 1",
    description: "Big section title",
    shortcut: "#",
    icon: "H1",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run(),
  },
  {
    key: "h2",
    title: "Heading 2",
    description: "Medium section heading",
    shortcut: "##",
    icon: "H2",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
  },
  {
    key: "h3",
    title: "Heading 3",
    description: "Sub-section",
    shortcut: "###",
    icon: "H3",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
  },
  {
    key: "ul",
    title: "Bulleted list",
    description: "A simple bulleted list",
    shortcut: "-",
    icon: "• ≡",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    key: "ol",
    title: "Numbered list",
    description: "Ordered list",
    shortcut: "1.",
    icon: "1. ≡",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    key: "task",
    title: "Task list",
    description: "Track to-dos with checkboxes",
    shortcut: "[]",
    icon: "☑",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    key: "quote",
    title: "Quote",
    description: "Pull out a line",
    shortcut: ">",
    icon: "”",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    key: "hr",
    title: "Divider",
    description: "A horizontal line",
    icon: "—",
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    key: "code",
    title: "Code block",
    description: "Monospace block of code",
    shortcut: "```",
    icon: "</>",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    key: "callout",
    title: "Callout",
    description: "Highlight something important",
    icon: "💡",
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertContent({
          type: "callout",
          attrs: { emoji: "💡" },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
  {
    key: "image",
    title: "Image",
    description: "Insert by URL",
    icon: "🖼",
    run: (e, r) => {
      const url = window.prompt("Image URL");
      if (!url) return;
      e.chain().focus().deleteRange(r).setImage({ src: url }).run();
    },
  },
  {
    key: "table",
    title: "Table",
    description: "Insert a 3×3 table",
    icon: "▦",
    run: (e, r) =>
      e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  const starts: SlashCommand[] = [];
  const contains: SlashCommand[] = [];
  for (const cmd of SLASH_COMMANDS) {
    const label = cmd.title.toLowerCase();
    if (label.startsWith(q)) starts.push(cmd);
    else if (label.includes(q)) contains.push(cmd);
  }
  return [...starts, ...contains];
}
````

- [ ] **Step 3: SlashMenu renderer**

Create `apps/fe/src/components/editor/slash-menu.tsx`:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SlashCommand } from "./slash-commands";

export type SlashMenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean };

type Props = {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
};

export const SlashMenu = forwardRef<SlashMenuHandle, Props>(function SlashMenu(
  { items, command },
  ref,
) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(1, items.length));
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % Math.max(1, items.length));
        return true;
      }
      if (event.key === "Enter") {
        const picked = items[index];
        if (picked) command(picked);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="patram-slash w-[280px] rounded-xl border border-[var(--line)] bg-white p-3 text-sm shadow-[0_18px_42px_rgb(30_90_72_/_0.22)]">
        <div className="text-[var(--sea-ink-soft)] italic">No matching blocks</div>
      </div>
    );
  }

  return (
    <div className="patram-slash w-[280px] rounded-xl border border-[var(--line)] bg-white p-1.5 text-[13px] shadow-[0_18px_42px_rgb(30_90_72_/_0.22)]">
      <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-bold tracking-[0.14em] text-[color:rgb(23_58_64_/_0.55)] uppercase">
        Basic blocks
      </div>
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          onMouseEnter={() => setIndex(i)}
          onClick={() => command(item)}
          className={
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left " +
            (i === index
              ? "bg-[color:rgb(79_184_178_/_0.14)]"
              : "hover:bg-[color:rgb(79_184_178_/_0.08)]")
          }
        >
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-[color:rgb(79_184_178_/_0.12)] text-xs font-bold text-[var(--lagoon-deep)]">
            {item.icon}
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-[var(--sea-ink)]">{item.title}</span>
            <span className="block text-[11px] text-[var(--sea-ink-soft)]">{item.description}</span>
          </span>
          {item.shortcut && (
            <span className="rounded border border-[var(--line)] bg-[color:rgb(23_58_64_/_0.06)] px-1 py-[1px] text-[10px] text-[var(--sea-ink-soft)]">
              {item.shortcut}
            </span>
          )}
        </button>
      ))}
      <div className="mt-1 border-t border-[var(--line)] px-2.5 py-1.5 text-[11px] text-[var(--sea-ink-soft)] italic">
        ↑↓ browse · ↵ pick · esc to dismiss
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Wire the suggestion extension**

Replace `apps/fe/src/components/editor/extensions.ts` with (additions at the end):

```ts
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import CharacterCount from "@tiptap/extension-character-count";
import { Extension, type Extensions } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { createRoot, type Root } from "react-dom/client";
import { createRef } from "react";
import { SlashMenu, type SlashMenuHandle } from "./slash-menu";
import { filterCommands, SLASH_COMMANDS, type SlashCommand } from "./slash-commands";

function createSlashExtension(): Extension {
  return Extension.create({
    name: "slashCommands",
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: "/",
          startOfLine: true,
          allowSpaces: false,
          items: ({ query }: { query: string }) => filterCommands(query).slice(0, 12),
          command: ({ editor, range, props }) => {
            const cmd = props as SlashCommand;
            cmd.run(editor, range);
          },
          render: () => {
            let root: Root | null = null;
            let container: HTMLDivElement | null = null;
            let tip: TippyInstance | null = null;
            const ref = createRef<SlashMenuHandle>();

            const mount = (props: { items: SlashCommand[]; command: (i: SlashCommand) => void; clientRect?: () => DOMRect | null }) => {
              if (!container) {
                container = document.createElement("div");
                root = createRoot(container);
              }
              root?.render(<SlashMenu ref={ref} items={props.items} command={props.command} />);
              const rect = props.clientRect?.();
              if (!tip) {
                tip = tippy(document.body, {
                  getReferenceClientRect: () => rect ?? new DOMRect(0, 0, 0, 0),
                  appendTo: () => document.body,
                  content: container,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                  duration: [120, 80],
                  animation: "shift-away-subtle",
                });
              } else if (rect) {
                tip.setProps({ getReferenceClientRect: () => rect });
              }
            };

            return {
              onStart: (props) => mount(props),
              onUpdate: (props) => mount(props),
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  tip?.hide();
                  return true;
                }
                return ref.current?.onKeyDown(props.event) ?? false;
              },
              onExit: () => {
                tip?.destroy();
                tip = null;
                root?.unmount();
                root = null;
                container = null;
              },
            };
          },
        }),
      ];
    },
  });
}

export function buildExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Placeholder.configure({
      showOnlyCurrent: false,
      placeholder: ({ node, pos }) => {
        if (node.type.name === "heading" && node.attrs.level === 1 && pos === 0) {
          return "Untitled — but full of potential";
        }
        if (node.type.name === "paragraph") {
          return "Press / to conjure a block, or just start writing.";
        }
        return "";
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    Highlight.configure({ multicolor: false }),
    Underline,
    TextStyle,
    Color,
    Image,
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    CharacterCount,
    createSlashExtension(),
  ];
}

export { SLASH_COMMANDS };
```

- [ ] **Step 5: Slash-menu open animation**

Append to `apps/fe/src/styles.css`:

```css
.patram-slash {
  animation: slash-pop 120ms ease-out;
  transform-origin: top left;
}
@keyframes slash-pop {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes emoji-spring {
  0% {
    transform: scale(0.8);
  }
  60% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}
```

- [ ] **Step 6: Verify**

Run: `vp run fe#dev`

- On a new empty line, type `/` → slash menu appears below the caret with "Basic blocks" header.
- Type `he` → filter narrows to Heading 1/2/3.
- `↑/↓` move highlight; `↵` picks; `esc` dismisses.
- Pick "Callout" — should insert a callout node (will render as raw JSON until Task 15).
- Pick each of Heading / Bulleted / Task / Quote / Divider / Code block / Image / Table and verify each works.

Stop the server.

- [ ] **Step 7: Commit**

```bash
git add apps/fe/src/components/editor apps/fe/src/styles.css
git commit -m "feat(fe): slash command menu with keyboard navigation"
```

---

## Task 15: Callout custom node

**Files:**

- Create: `apps/fe/src/components/editor/callout-node.tsx`
- Modify: `apps/fe/src/components/editor/extensions.ts` (register the node)
- Modify: `apps/fe/src/styles.css` (styles)

- [ ] **Step 1: CalloutNode**

Create `apps/fe/src/components/editor/callout-node.tsx`:

```tsx
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useState } from "react";
import { EmojiPalette } from "#/components/doc/emoji-palette";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";

function CalloutView({ node, updateAttributes }: any) {
  const [open, setOpen] = useState(false);
  return (
    <NodeViewWrapper
      data-callout
      className="my-3 flex gap-2.5 rounded-xl border border-[color:rgb(79_184_178_/_0.3)] bg-[color:rgb(79_184_178_/_0.1)] p-3"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            contentEditable={false}
            className="h-7 select-none rounded-md px-1.5 text-lg leading-none transition hover:bg-white/50"
            aria-label="Change callout icon"
          >
            {node.attrs.emoji ?? "💡"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <EmojiPalette
            onPick={(e) => {
              updateAttributes({ emoji: e });
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <NodeViewContent className="flex-1 text-[14px] text-[var(--sea-ink)]" />
    </NodeViewWrapper>
  );
}

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      emoji: { default: "💡" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-callout]",
        getAttrs: (el) => ({ emoji: (el as HTMLElement).dataset.emoji ?? "💡" }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
```

- [ ] **Step 2: Register in extensions**

Modify `apps/fe/src/components/editor/extensions.ts`:

- Import at top: `import { CalloutNode } from "./callout-node";`
- In the `buildExtensions()` array, add `CalloutNode,` just before `createSlashExtension()`.

- [ ] **Step 3: Verify**

Run: `vp run fe#dev`

- Existing seed docs (Retro — April, Q2 planning) render callouts as rounded lagoon-tint blocks with the 💡 icon.
- Click the icon → emoji palette opens → picking swaps the icon.
- Type content inside the callout. Press Enter creates another paragraph inside. Press Enter on an empty last paragraph exits the callout (default ProseMirror behavior).
- `/` → Callout → creates an empty callout.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/editor apps/fe/src/components/editor/callout-node.tsx
git commit -m "feat(fe): callout custom node with emoji picker"
```

---

## Task 16: AppShell smoke test

One RTL test that proves the shell mounts, seed docs are shown, and clicking "+ New document" creates a new doc.

**Files:**

- Create: `apps/fe/src/components/app-shell.test.tsx`

- [ ] **Step 1: Write the test**

Create `apps/fe/src/components/app-shell.test.tsx`:

```tsx
import { describe, expect, test } from "vite-plus/test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./app-shell";

describe("<AppShell />", () => {
  test("renders sidebar with seed docs and the selected doc title in the breadcrumb", () => {
    render(<AppShell />);

    // getByText / getByRole throw on miss, so we don't need jest-dom matchers.
    screen.getByText("Patram");
    screen.getByRole("button", { name: /new document/i });
    screen.getByText("Onboarding notes");
    screen.getByText("Q2 planning");

    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    within(nav).getByText("Q2 planning");
  });

  test("creates a new doc when + New document is clicked", async () => {
    render(<AppShell />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /new document/i }));
    // A new row with title "Untitled" appears (findByText throws on miss).
    const row = await screen.findByText("Untitled");
    expect(row.textContent).toBe("Untitled");
  });
});
```

- [ ] **Step 2: Add testing-library/user-event if missing**

Check: `grep user-event apps/fe/package.json`.
If absent, run: `vp add -F fe --dev @testing-library/user-event`.

- [ ] **Step 3: Run the test**

Run: `vp test run apps/fe/src/components/app-shell.test.tsx`
Expected: PASS. This test does not exercise the editor — only sidebar + breadcrumb + new-doc button — so jsdom limitations around ProseMirror don't apply.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/app-shell.test.tsx apps/fe/package.json pnpm-lock.yaml
git commit -m "test(fe): smoke test for app shell"
```

---

## Task 17: End-to-end manual verification

Final manual sweep before declaring v1 done.

- [ ] **Step 1: Full build + checks**

Run:

```bash
vp check
vp test
```

Expected: both pass.

- [ ] **Step 2: Dev sweep**

Run: `vp run fe#dev`, open `http://localhost:3000`. Walk through:

1. ✅ Four seed docs visible; Q2 planning selected.
2. ✅ Sidebar hover shows lagoon halo on rows.
3. ✅ `⌘\` (or click `⇤`) collapses the sidebar to 56px rail; again expands.
4. ✅ Click "+ New document" → new Untitled doc appears and is selected.
5. ✅ Click a pinned doc → selection moves.
6. ✅ Pin star in topbar toggles the pin chip in the sidebar row.
7. ✅ ⋯ → Delete removes the doc and selects the previous one.
8. ✅ Type in the doc H1 — sidebar row title updates after ~600ms; save chip morphs Saving → Saved · just now.
9. ✅ Select text → bubble menu appears; toggle B/I/U/S/code/highlight/color; set a link; "Turn into" switches the block type.
10. ✅ On a new line type `/` → slash menu opens; filter by typing; `↑↓↵` navigate and pick; each command inserts the right block.
11. ✅ Callout blocks render with a lagoon tint; clicking the icon swaps the emoji with a small spring.
12. ✅ Light/Dark toggle in the sidebar footer swaps theme; tokens flip without layout shift.
13. ✅ Resize window under 960px → sidebar auto-collapses to the rail.

Stop the server.

- [ ] **Step 3: Final commit (if the dev sweep surfaced tiny polish fixes)**

```bash
git add -A
git commit -m "chore(fe): final polish after manual sweep"
```

If nothing changed, skip this step.

---

## Self-review notes

**Spec coverage:**

- Layout (spec §4) → Task 11.
- Sidebar (spec §5) → Task 8.
- Topbar (spec §6) → Task 9.
- Doc surface (spec §7) → Task 10.
- Tiptap deps (spec §8.1) → Task 1.
- Slash menu (spec §8.2) → Task 14.
- Bubble menu (spec §8.3) → Task 13.
- Callout node (spec §8.4) → Task 15.
- Placeholder (spec §8.5) → Task 12.
- Store + save debounce + title sync (spec §9) → Tasks 5, 6, 12.
- Components list (spec §10) → Tasks 7-15.
- Seed content (spec §11) → Task 6.
- Route (spec §12) → Task 11.
- Accessibility (spec §13) → threaded through Tasks 8-13.
- Playfulness (spec §14) → Tasks 7, 10, 12, 14.
- Quality gates (spec §15) → Tasks 3, 5, 16, 17.

**Known trade-offs baked into the plan:**

- Slash-menu filter is the simple two-bucket substring ranker from the spec (Task 14). Good enough for 12 commands.
- Bubble menu color picker uses a CSS-only hover/focus reveal rather than a full popover to keep DOM weight down inside the editor overlay.
- Bubble-menu and slash-menu tests are deferred to the manual sweep (Task 17) because tippy.js + ProseMirror selection behavior is unreliable under jsdom; smoke coverage sits at the store and shell layers (Tasks 5, 16).
- localStorage persistence is not wired in v1 despite the spec mentioning it behind `VITE_PERSIST`. Leaving it out keeps the v1 scope clean; adding it later is a 5-line subscription on the store singleton.
