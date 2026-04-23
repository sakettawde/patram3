# Patram — Document Dashboard UI (v1)

**Date:** 2026-04-23
**Status:** Approved design, ready for implementation planning
**Scope:** UI-only. Single page, frontend-only. No backend wiring, no auth, no real persistence.

## 1. Goal

Build the first screen of **Patram**, a document-management dashboard. The screen is a single page with two zones:

- **Left sidebar** — lightweight navigation (brand, search stub, new-doc button, Pinned + All documents, user chip, theme toggle).
- **Center body** — a super-clean Tiptap writing surface. No toolbar above the editor. Formatting is exposed through a **slash menu** (`/` on empty line) and a **floating bubble menu** (appears on selection).

The design target is **professional, modern, minimal, with a hint of playfulness**, using a **cool lagoon/sea-ink palette** that already exists in `apps/fe/src/styles.css`.

## 2. Non-goals (v1)

The following are explicitly out of scope and must not be built:

- Backend, API, authentication, real persistence layer
- Folders, tag-based filtering, multi-select, drag-to-reorder
- Collaboration (multi-user cursors, comments, mentions, presence)
- Real mobile layout (desktop-first; only needs to degrade without breaking)
- `/ai` slash command or any AI-backed feature
- Export (PDF / Markdown / HTML)
- Sharing, permissions, roles
- Realtime sync between tabs

## 3. Design tokens

Keep the existing palette. Fonts (Fraunces, Manrope) and CSS variables are already defined in `apps/fe/src/styles.css`. No new CSS variables are required for v1.

**Primary tokens used (from existing `styles.css`):**

| Token              | Value                    | Usage                               |
| ------------------ | ------------------------ | ----------------------------------- |
| `--sea-ink`        | `#173a40`                | Primary text, titles                |
| `--sea-ink-soft`   | `#416166`                | Secondary text, meta                |
| `--lagoon`         | `#4fb8b2`                | Caret, accents, hover halo          |
| `--lagoon-deep`    | `#328f97`                | Primary button gradient, links      |
| `--palm`           | `#2f6a4a`                | Brand mark gradient stop, tag chips |
| `--sand`, `--foam` | `#e7f0e8` / `#f3faf5`    | Page background stops               |
| `--surface`        | `rgba(255,255,255,0.74)` | Sidebar/card surface                |
| `--line`           | `rgba(23,58,64,0.14)`    | Borders                             |

**Fonts:**

- **Fraunces** (already loaded) — brand lockup, doc H1, section H2 inside the editor.
- **Manrope** (already loaded, `--font-sans`) — all UI chrome and body copy.

## 4. Layout

```
┌── 264px ──┬─────────────── Main ───────────────┐
│  Sidebar  │  Topbar (44px)                      │
│           │  crumb · · · saved chip · ★ · ⋯     │
│           ├──────────────────────────────────────┤
│           │                                      │
│           │      Doc surface (max-w 680px)       │
│           │      doc emoji, H1, meta, body       │
│           │                                      │
└───────────┴──────────────────────────────────────┘
```

- Sidebar fixed at **264px**. Collapsible to a **56px icon rail**. Two ways to toggle: the `⇤` icon in the sidebar's top-right, and the `⌘\` keyboard shortcut.
- Main area is flexible, `overflow-y: auto`.
- Doc surface is centered with `max-width: 680px` and generous top padding (~56px) for breathing room.
- Desktop-first. Below 960px viewport width, sidebar collapses automatically to its rail state. No other responsive work this pass.

## 5. Sidebar

Structure from top to bottom:

1. **Brand row** — `<BrandMark />` (Fraunces wordmark "Patram" + 18×18 rounded square with `linear-gradient(135deg, --lagoon, --palm)`). Right side: small `⇤` collapse icon.
2. **Search input** — a single `Input` with a search icon and a right-aligned `⌘K` kbd chip. Clicking focuses; typing does nothing in v1 (stub).
3. **+ New document** — full-width primary button. Lagoon gradient (`--lagoon` → `--lagoon-deep`), white text, soft inset highlight. On click: calls `documents.createDoc()` → selects new doc.
4. **Section: Pinned** — uppercase label with count chip, then list of pinned docs.
5. **Section: All documents** — uppercase label with count chip, then list of all docs not pinned.
6. **Footer** — user chip (avatar + name + email) plus a compact theme toggle (`☀ / ☾`).

**Doc row anatomy:**

- Height ≈ 32px, rounded 8px, horizontal padding 10px.
- Emoji (18px) + title (13px, `--sea-ink`) + trailing pin ★ (only if pinned).
- **Active state:** background `rgba(79,184,178,0.18)`, border `rgba(79,184,178,0.35)`.
- **Hover state:** background `rgba(79,184,178,0.10)` (lagoon halo).

## 6. Topbar

Thin (44px) row above the doc surface.

- **Left:** breadcrumb `All documents / <doc title>`, 12px, `--sea-ink-soft` with current item in `--sea-ink`.
- **Right:**
  - **Save status chip:** `Saved · just now` in lagoon-tint pill. Morphs between three states driven by editor activity:
    - `Saving…` (spinner icon)
    - `Saved · just now` (lagoon check)
    - `Saved · 3 min ago` (tick icon, updates every minute via a timer)
  - **Pin star** — toggles `doc.pinned`.
  - **Overflow ⋯** — `DropdownMenu` with _Duplicate_, _Delete_, _Change icon_ (stubs — _Delete_ actually deletes and deselects).

## 7. Doc surface

Top to bottom inside the centered 680px column:

1. **Doc emoji** (42px). Click to open a small popover with a fixed 24-emoji palette. Picking swaps the emoji with a subtle spring (`transform: scale(0.8) → 1` over 180ms).
2. **H1 title** — Fraunces 38px, `--sea-ink`, `line-height: 1.1`. Rendered as the **first block of the editor** (contenteditable). Placeholder: _Untitled — but full of potential_, italic, `--sea-ink-soft` at 0.6 opacity.
3. **Meta row** — one tag chip (`--palm` on light lagoon background) + `Edited Xm ago · N words`.
4. **Tiptap body** — the rest of the editor. Placeholder on first empty paragraph: _Press `/` to conjure a block, or just start writing._

## 8. Editor — Tiptap

### 8.1 Dependencies

Install:

- `@tiptap/react`
- `@tiptap/pm`
- `@tiptap/starter-kit`
- `@tiptap/extension-placeholder`
- `@tiptap/extension-task-list`
- `@tiptap/extension-task-item`
- `@tiptap/extension-link`
- `@tiptap/extension-highlight`
- `@tiptap/extension-underline`
- `@tiptap/extension-text-style`
- `@tiptap/extension-color`
- `@tiptap/extension-image`
- `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`
- `@tiptap/extension-character-count`
- `@tiptap/extension-bubble-menu`
- `@tiptap/suggestion`
- `tippy.js` (for slash-menu positioning)

All installed via `vp add <pkg>`. Versions to be pinned to the latest stable Tiptap 2.x at implementation time, using `ctx7` to verify current API before writing code.

### 8.2 Slash menu

- Trigger: `/` as the first character of an empty paragraph (use `@tiptap/suggestion` with `char: '/'`, `startOfLine: true`).
- Rendered via a custom React component mounted inside a `tippy.js` instance. Positioned at the caret.
- Filtering: case-insensitive substring match against the label on user input after `/`. Prefix matches rank above non-prefix matches. No typo tolerance.
- Keyboard: `↑` / `↓` to move, `↵` to pick, `esc` to dismiss.
- Footer hint: italic 11px `↑↓ browse · ↵ pick · esc to dismiss`.
- Open animation: `scale: 0.96 → 1` + fade, 120ms.

**Commands:**

| Label         | Icon | Action                                |
| ------------- | ---- | ------------------------------------- |
| Heading 1     | H1   | `toggleHeading({ level: 1 })`         |
| Heading 2     | H2   | `toggleHeading({ level: 2 })`         |
| Heading 3     | H3   | `toggleHeading({ level: 3 })`         |
| Bulleted list | • ≡  | `toggleBulletList`                    |
| Numbered list | 1. ≡ | `toggleOrderedList`                   |
| Task list     | ☑    | `toggleTaskList`                      |
| Quote         | ”    | `toggleBlockquote`                    |
| Divider       | —    | `setHorizontalRule`                   |
| Code block    | `{}` | `toggleCodeBlock`                     |
| Callout       | 💡   | `setCallout` (custom node — see §8.4) |
| Image         | 🖼   | Insert image by URL (prompt for v1)   |
| Table         | ▦    | Insert 3×3 table                      |

### 8.3 Bubble menu

- Trigger: non-empty text selection inside the editor body.
- Dark lagoon-ink background (`#0f2e33`), `box-shadow` 0 14px 34px; appears 52px above the selection.
- Never shows when the selection is only whitespace or empty.

**Actions:**

1. **B** — bold
2. **I** — italic
3. **U** — underline
4. **S** — strikethrough
5. **</>** — inline code
6. **🖍** — highlight (lagoon tint, no picker in v1 — single highlight color)
7. **A▾** — text color dropdown (5 swatches: ink, lagoon, palm, amber, plum)
8. **🔗 Link** — opens a small link popover with URL input + `↵` to commit
9. **H2 ▾** — "turn into" dropdown (Paragraph, H1, H2, H3, Quote)

Active-state styling: button background `rgba(79,184,178,0.22)`.

### 8.4 Callout custom node

Block-level Tiptap node `callout`.

- Schema: `content: 'block+'`, `group: 'block'`, renders as `<div data-callout>` with a leading emoji (default 💡).
- Parse rule: `div[data-callout]`.
- React rendering uses `NodeViewWrapper`; the emoji cell is clickable and opens the same 24-emoji palette used for doc emoji.
- Styling matches the lagoon-tint callout in the mockup (background `rgba(79,184,178,0.10)`, border `rgba(79,184,178,0.30)`, radius 10px).

### 8.5 Placeholder

Use `@tiptap/extension-placeholder` with a `showOnlyCurrent: false` config so _both_ empty title and empty body show their placeholder. Different placeholders per node type — the H1 first-block gets _Untitled — but full of potential_, everything else gets _Press `/` to conjure a block, or just start writing._

## 9. State

Use **Zustand** (install: `vp add zustand`). One store: `stores/documents.ts`.

```ts
type Doc = {
  id: string; // nanoid
  title: string;
  emoji: string; // single grapheme
  tag: string | null; // v1: single optional tag
  contentJson: JSONContent; // Tiptap JSON
  wordCount: number;
  updatedAt: number; // epoch ms
  pinned: boolean;
};

type DocumentsStore = {
  docs: Record<string, Doc>;
  order: string[]; // insertion order
  selectedId: string | null;
  createDoc: () => string; // returns id
  updateDoc: (id: string, patch: Partial<Doc>) => void;
  pinDoc: (id: string, pinned: boolean) => void;
  deleteDoc: (id: string) => void;
  selectDoc: (id: string) => void;
  renameDoc: (id: string, title: string) => void;
  setEmoji: (id: string, emoji: string) => void;
};
```

- **Save debounce:** the editor calls `updateDoc` at most every 600ms while typing, always updating `updatedAt`, `wordCount`, and `contentJson`.
- **Title sync:** the first `heading[level=1]` node in `contentJson` is the source of truth for `doc.title`. The editor derives the plain-text title from that node on each debounced save and calls `renameDoc`. The sidebar reads `doc.title` from the store and re-renders. If the first block is not an H1, `doc.title` falls back to `"Untitled"`.
- **localStorage mirror:** gated behind `import.meta.env.VITE_PERSIST === '1'`. Default off (pure in-memory). If on: subscribe the store to `localStorage.setItem('patram.docs', ...)` on change; hydrate on init.
- **Seed:** if the store is empty on boot, insert 4 seed docs (see §11).

## 10. Components

All component files live under `apps/fe/src/components/` and use `#/components/...` imports.

| Component          | File                          | Responsibility                                                  |
| ------------------ | ----------------------------- | --------------------------------------------------------------- |
| `AppShell`         | `app-shell.tsx`               | Grid layout, selects doc from store, renders Sidebar + Main.    |
| `Sidebar`          | `sidebar/sidebar.tsx`         | Brand, search, new-doc, Pinned section, All section, footer.    |
| `SidebarSection`   | `sidebar/sidebar-section.tsx` | Uppercase label + count chip + children.                        |
| `DocRow`           | `sidebar/doc-row.tsx`         | Single sidebar list item (emoji, title, pin, active state).     |
| `UserChip`         | `sidebar/user-chip.tsx`       | Avatar + name/email + theme toggle slot.                        |
| `ThemeToggle`      | `theme-toggle.tsx`            | Sun/moon pill, toggles `.dark` on `<html>`.                     |
| `Topbar`           | `topbar.tsx`                  | Crumb + save chip + pin star + overflow.                        |
| `SaveStatus`       | `save-status.tsx`             | Chip that morphs Saving…/Saved…/Saved · Xm ago.                 |
| `DocSurface`       | `doc/doc-surface.tsx`         | Centered 680px column. Renders emoji + H1 + meta + Editor.      |
| `DocEmoji`         | `doc/doc-emoji.tsx`           | Emoji button + popover palette.                                 |
| `EmojiPalette`     | `doc/emoji-palette.tsx`       | Fixed 24-emoji grid popover.                                    |
| `DocMeta`          | `doc/doc-meta.tsx`            | Tag chip + relative-time + word count.                          |
| `Editor`           | `editor/editor.tsx`           | Thin wrapper over `useEditor`. Configures extensions, commands. |
| `editorExtensions` | `editor/extensions.ts`        | Extension array factory; keeps Editor lean.                     |
| `SlashMenu`        | `editor/slash-menu.tsx`       | Tippy-rendered command list with keyboard nav.                  |
| `BubbleMenu`       | `editor/bubble-menu.tsx`      | Floating formatting bar on selection.                           |
| `CalloutNode`      | `editor/callout-node.tsx`     | Custom node + `NodeViewWrapper`.                                |
| `LinkPopover`      | `editor/link-popover.tsx`     | URL input for Link button.                                      |
| `TurnIntoMenu`     | `editor/turn-into-menu.tsx`   | Block-type dropdown inside bubble menu.                         |

**shadcn primitives (installed via `vp dlx shadcn@latest add <name>`):** `button`, `input`, `separator`, `tooltip`, `dropdown-menu`, `popover`, `scroll-area`, `avatar`, `kbd` (if available; otherwise a plain styled `<kbd>`).

Helpers in `apps/fe/src/lib/`:

- `seed-docs.ts` — four hand-authored Tiptap JSON docs demonstrating each block.
- `format-time.ts` — `"3 min ago"` / `"just now"` / `"Apr 22"`.
- `shortcut.ts` — returns display strings for `⌘\`, `⌘K`, etc. based on platform.

## 11. Seed content

Four docs, created in this order, last one selected initially:

1. `🌿 Onboarding notes` (pinned) — H1 + intro paragraph + H2 + task list.
2. `📐 Product principles` (pinned) — H1 + quote + bullet list.
3. `📝 Retro — April` — H1 + H2 + task list (mix of done/not-done) + callout.
4. `🌊 Q2 planning` (selected) — matches the mockup content (H1, intro, callout, H2 + tasks, H2 "Open questions").

## 12. Route

Replace the body of `apps/fe/src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";

export const Route = createFileRoute("/")({ component: AppShell });
```

No new routes. No route-level data loading.

## 13. Accessibility

- All interactive icons have visible `aria-label`s.
- Keyboard: `⌘\` toggle sidebar; `⌘K` focuses search; `↑↓↵esc` inside slash menu; `⌘B/I/U` for inline marks (Tiptap defaults).
- Focus ring uses existing `--ring`.
- Emoji palette and ⋯ overflow are keyboard-navigable via shadcn `Popover` / `DropdownMenu`.
- Color-only state (active doc, bubble-menu active button) is always paired with a non-color signal (border, weight change).

## 14. Playfulness (D, with B emphasis)

Baked into the design rather than added later:

- **Lagoon caret** (2px, `--lagoon`, blinking) — editor `.ProseMirror` caret-color override.
- **Sidebar hover halo** — `box-shadow: 0 0 0 1px rgba(79,184,178,0.25)` + tint on row hover.
- **Slash menu open** — 120ms `scale(0.96→1)` + fade.
- **Save chip morph** — Saving… (spinner) → ✓ Saved · just now (check fade) → Saved · Xm ago.
- **Emoji-pick spring** — 180ms `scale(0.8→1)` on the chosen emoji.
- **Whisper placeholders** — italic, 0.6 opacity, warm copy.
- **Slash hint footer** — `↑↓ browse · ↵ pick · esc to dismiss` in italic.
- **Serif H1** — Fraunces 38px with `letter-spacing: -0.02em`.

## 15. Quality gates

Before the design is considered implemented:

- `vp check` passes (format + lint + TS).
- `vp test` passes — unit tests for `DocumentsStore` (createDoc, pinDoc, deleteDoc, renameDoc, selectDoc behavior) and one React Testing Library smoke test that mounts `<AppShell/>`, creates a doc, and verifies the editor mounts.
- Manual check: open the dev server, create a doc, type `/`, see slash menu; select text, see bubble menu; toggle a heading; toggle dark mode; pin a doc; delete a doc; collapse sidebar with `⌘\`.

## 16. Open flags (not blocking)

- If Tiptap has updated its `BubbleMenu` plugin integration (it has shifted between extension and React component in recent versions), we will verify via `ctx7` at implementation time and adjust.
- Emoji picker is a fixed 24-emoji palette for v1. Full picker (`emoji-mart` et al.) deferred.
- Word count is authoritative from `CharacterCount.words()` rather than a custom split.
