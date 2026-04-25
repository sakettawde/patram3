# Patram — Mock AI Assistant Panel + Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mock AI assistant panel that occupies the left half of the content area when open and a Sessions tab in the sidebar for managing multiple chat threads, with animated entry/exit and `Cmd/Ctrl+/` toggle.

**Architecture:** A new `AssistantPanel` component is mounted as a flex sibling of the existing editor inside `Main`'s content row. The panel and sessions are driven by a new persisted Zustand store (`stores/assistant.ts`) that mirrors the patterns of `stores/documents.ts` but adds `zustand/middleware`'s `persist` for localStorage. A second small persisted store (`stores/ui.ts`) holds the sidebar's active tab. Inside the sidebar, a tab switcher chooses between the existing docs list and a new sessions list. All replies are produced locally by `lib/mock-replies.ts` after a randomized `setTimeout`.

**Tech Stack:** React 19, TanStack Start (SPA), Zustand 5 (vanilla + persist middleware), Tailwind 4, Radix UI (already used for dropdowns), lucide-react icons, `vite-plus/test` for unit/component tests, `@testing-library/react` for component rendering.

**Spec:** [docs/superpowers/specs/2026-04-25-patram-ai-assistant-panel-design.md](../specs/2026-04-25-patram-ai-assistant-panel-design.md)

**Spec refinement (locked into this plan):** The spec proposed a single `pending: boolean` keyed off the active session. Because reply timers are bound to the session id captured at send time and may resolve on a non-active session, this plan models pending state as `pendingSessionIds: Record<string, true>` and the panel selects `pendingSessionIds[selectedSessionId]`. Same intent, no cross-session indicator bug.

---

## File Structure

### New files

| Path                                                   | Responsibility                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/fe/src/lib/mock-replies.ts`                      | Pure module exporting `MOCK_REPLIES` array and `pickReply(messageCount)` round-robin selector.                                  |
| `apps/fe/src/stores/assistant.ts`                      | Vanilla Zustand store with `persist` middleware: sessions map, order, selectedSessionId, open, pendingSessionIds, plus actions. |
| `apps/fe/src/stores/ui.ts`                             | Vanilla Zustand store with `persist`: sidebar tab + setter.                                                                     |
| `apps/fe/src/components/sidebar/sidebar-tabs.tsx`      | Two-segment switcher between "Docs" and "Sessions".                                                                             |
| `apps/fe/src/components/sidebar/session-row.tsx`       | Single session row + dropdown with delete.                                                                                      |
| `apps/fe/src/components/sidebar/sessions-list.tsx`     | Sessions tab body: "+ New chat" button + sorted list of `SessionRow`s.                                                          |
| `apps/fe/src/components/sidebar/docs-list.tsx`         | Docs tab body extracted from current `Sidebar` (search + new-doc + doc rows).                                                   |
| `apps/fe/src/components/assistant/message-bubble.tsx`  | Single bubble (user or assistant variant).                                                                                      |
| `apps/fe/src/components/assistant/message-list.tsx`    | Scrollable list of bubbles + typing indicator + empty state, auto-scrolls.                                                      |
| `apps/fe/src/components/assistant/composer.tsx`        | Auto-grow textarea + send button. Enter sends, Shift+Enter newline.                                                             |
| `apps/fe/src/components/assistant/assistant-panel.tsx` | Header (title + close), `MessageList`, `Composer`. Wired to store.                                                              |

### Modified files

| Path                                         | Change                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/fe/src/components/app-shell.tsx`       | Restructure Main as `Topbar` + flex content-row containing `AssistantPanel` and the editor area. Add `Cmd/Ctrl+/` shortcut. |
| `apps/fe/src/components/topbar.tsx`          | Add assistant toggle button on the left, before the doc title. Active when panel open.                                      |
| `apps/fe/src/components/sidebar/sidebar.tsx` | Render `SidebarTabs` and switch between `DocsList` and `SessionsList`.                                                      |
| `apps/fe/src/components/app-shell.test.tsx`  | Add tests for the new layout, `Ctrl+/` shortcut, and `Ctrl+\` independence.                                                 |

### Test files (new, colocated)

- `apps/fe/src/lib/mock-replies.test.ts`
- `apps/fe/src/stores/assistant.test.ts`
- `apps/fe/src/stores/ui.test.ts`
- `apps/fe/src/components/assistant/assistant-panel.test.tsx`
- `apps/fe/src/components/sidebar/sidebar-tabs.test.tsx`

---

## Conventions to follow

- Test imports use `import { describe, expect, test, vi, beforeEach } from "vite-plus/test"` (NOT `vitest`).
- Path alias `#/` resolves to `apps/fe/src/`.
- Vanilla store pattern from `stores/documents.ts`: `createStore<T>((set, get) => ({...}))` plus a `useX` hook using `useStore(storeApi, selector)`.
- For persisted stores, wrap the state factory with `persist` from `zustand/middleware`. Because `persist` reads/writes `window.localStorage` synchronously on init, tests that construct fresh stores must clear localStorage between tests (use `beforeEach(() => localStorage.clear())`).
- Class names use the existing CSS variables: `bg-(--paper)`, `bg-(--paper-soft)`, `text-(--ink)`, `text-(--ink-soft)`, `text-(--ink-faint)`, `border-(--rule)`, `bg-(--selection)`.
- Keep components small (<150 LOC each). When a component reaches that, factor out a child.
- Use `nanoid(8)` for ids (matches `documents.ts`).

---

## Task 1: Mock replies module

**Goal:** A pure, tested module that returns a canned reply given a message count.

**Files:**

- Create: `apps/fe/src/lib/mock-replies.ts`
- Test: `apps/fe/src/lib/mock-replies.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/fe/src/lib/mock-replies.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { MOCK_REPLIES, pickReply } from "./mock-replies";

describe("mock-replies", () => {
  test("MOCK_REPLIES has at least 4 entries", () => {
    expect(MOCK_REPLIES.length).toBeGreaterThanOrEqual(4);
  });

  test("pickReply cycles through the pool by message count", () => {
    const r0 = pickReply(0);
    const rPool = pickReply(MOCK_REPLIES.length);
    expect(r0).toBe(rPool); // wraps around
  });

  test("pickReply returns a non-empty string", () => {
    expect(pickReply(0).length).toBeGreaterThan(0);
    expect(pickReply(7).length).toBeGreaterThan(0);
  });

  test("pickReply handles negative or out-of-range counts gracefully", () => {
    expect(typeof pickReply(-3)).toBe("string");
    expect(typeof pickReply(9999)).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/lib/mock-replies.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/fe/src/lib/mock-replies.ts`:

```ts
export const MOCK_REPLIES: readonly string[] = [
  "That is a great question. Here is a thought: clarity often arrives once the constraints are written down. Try sketching the inputs and outputs before the prose.",
  "I would lean toward the simpler shape first. You can always add a layer when a real second use case shows up.",
  "Consider splitting the section into two: the why and the how. Readers tend to skim until they find their question.",
  "A few small edits could tighten this. Trim the qualifier in the opener, and let the verbs do the work.",
  "If the goal is to ship today, mark the open question as a follow-up and keep moving. Momentum is its own kind of correctness.",
  "One thread to pull on: who is the audience for this paragraph? Naming them often reshapes the surrounding sentences.",
];

export function pickReply(messageCount: number): string {
  const len = MOCK_REPLIES.length;
  if (len === 0) return "";
  const idx = ((messageCount % len) + len) % len; // safe modulo for negatives
  return MOCK_REPLIES[idx]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/fe/src/lib/mock-replies.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/mock-replies.ts apps/fe/src/lib/mock-replies.test.ts
git commit -m "feat(fe): add mock-replies pool and round-robin picker"
```

---

## Task 2: UI store (sidebar tab)

**Goal:** Tiny persisted store with a single `sidebarTab` field.

**Files:**

- Create: `apps/fe/src/stores/ui.ts`
- Test: `apps/fe/src/stores/ui.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/fe/src/stores/ui.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createUiStore } from "./ui";

describe("UiStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("defaults to docs tab", () => {
    const s = createUiStore();
    expect(s.getState().sidebarTab).toBe("docs");
  });

  test("setSidebarTab switches", () => {
    const s = createUiStore();
    s.getState().setSidebarTab("sessions");
    expect(s.getState().sidebarTab).toBe("sessions");
  });

  test("persists across instances via localStorage", () => {
    const a = createUiStore();
    a.getState().setSidebarTab("sessions");
    const b = createUiStore();
    expect(b.getState().sidebarTab).toBe("sessions");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/stores/ui.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/fe/src/stores/ui.ts`:

```ts
import { useStore } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";

export type SidebarTab = "docs" | "sessions";

export type UiStore = {
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
};

export function createUiStore(): StoreApi<UiStore> {
  return createStore<UiStore>()(
    persist(
      (set) => ({
        sidebarTab: "docs",
        setSidebarTab: (tab) => set({ sidebarTab: tab }),
      }),
      {
        name: "patram.ui.v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({ sidebarTab: s.sidebarTab }),
      },
    ),
  );
}

export const uiStore = createUiStore();

export function useUi<T>(selector: (s: UiStore) => T): T {
  return useStore(uiStore, selector);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/fe/src/stores/ui.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/stores/ui.ts apps/fe/src/stores/ui.test.ts
git commit -m "feat(fe): add persisted ui store for sidebar tab"
```

---

## Task 3: Assistant store (sessions + open + pending)

**Goal:** Persisted store with sessions, selectedSessionId, open, pendingSessionIds, and all actions including `sendMessage` with simulated delay.

**Files:**

- Create: `apps/fe/src/stores/assistant.ts`
- Test: `apps/fe/src/stores/assistant.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/fe/src/stores/assistant.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createAssistantStore } from "./assistant";

describe("AssistantStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("defaults: closed, no session", () => {
    const s = createAssistantStore();
    expect(s.getState().open).toBe(false);
    expect(s.getState().selectedSessionId).toBeNull();
    expect(s.getState().order).toEqual([]);
  });

  test("toggleOpen flips open", () => {
    const s = createAssistantStore();
    s.getState().toggleOpen();
    expect(s.getState().open).toBe(true);
    s.getState().toggleOpen();
    expect(s.getState().open).toBe(false);
  });

  test("createSession adds, selects, opens", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    expect(s.getState().sessions[id]).toBeTruthy();
    expect(s.getState().sessions[id].title).toBe("New chat");
    expect(s.getState().sessions[id].messages).toEqual([]);
    expect(s.getState().order).toContain(id);
    expect(s.getState().selectedSessionId).toBe(id);
    expect(s.getState().open).toBe(true);
  });

  test("selectSession sets selection and opens panel", () => {
    const s = createAssistantStore();
    const a = s.getState().createSession();
    const b = s.getState().createSession();
    s.getState().setOpen(false);
    s.getState().selectSession(a);
    expect(s.getState().selectedSessionId).toBe(a);
    expect(s.getState().open).toBe(true);
    expect(s.getState().sessions[b]).toBeTruthy(); // unaffected
  });

  test("renameSession updates title; empty title falls back to 'New chat'", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().renameSession(id, "Plot ideas");
    expect(s.getState().sessions[id].title).toBe("Plot ideas");
    s.getState().renameSession(id, "  ");
    expect(s.getState().sessions[id].title).toBe("New chat");
  });

  test("deleteSession removes, advances selection to next-most-recent", () => {
    const s = createAssistantStore();
    const a = s.getState().createSession();
    // bump b's updatedAt so it's most recent
    const b = s.getState().createSession();
    s.getState().deleteSession(b);
    expect(s.getState().sessions[b]).toBeUndefined();
    expect(s.getState().selectedSessionId).toBe(a);
  });

  test("deleteSession on last session leaves selectedSessionId null", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().deleteSession(id);
    expect(s.getState().selectedSessionId).toBeNull();
  });

  test("sendMessage appends user msg, sets pending; after timer appends assistant msg", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("hello");
    let session = s.getState().sessions[id]!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("user");
    expect(session.messages[0].content).toBe("hello");
    expect(s.getState().pendingSessionIds[id]).toBe(true);

    vi.advanceTimersByTime(1500);

    session = s.getState().sessions[id]!;
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1].role).toBe("assistant");
    expect(session.messages[1].content.length).toBeGreaterThan(0);
    expect(s.getState().pendingSessionIds[id]).toBeUndefined();
  });

  test("sendMessage with no active session is a no-op", () => {
    const s = createAssistantStore();
    s.getState().sendMessage("hello");
    expect(s.getState().order).toEqual([]);
  });

  test("session title auto-derives from first user message", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("Outline my essay on quiet design");
    expect(s.getState().sessions[id]!.title).toBe("Outline my essay on quiet design");
  });

  test("session title does not change after second user message", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("First");
    vi.advanceTimersByTime(1500);
    s.getState().sendMessage("Second");
    expect(s.getState().sessions[id]!.title).toBe("First");
  });

  test("reply lands on the original session even after switch", () => {
    const s = createAssistantStore();
    const a = s.getState().createSession();
    s.getState().sendMessage("from a");
    const b = s.getState().createSession();
    expect(s.getState().selectedSessionId).toBe(b);
    vi.advanceTimersByTime(1500);
    expect(s.getState().sessions[a]!.messages).toHaveLength(2);
    expect(s.getState().sessions[b]!.messages).toHaveLength(0);
  });

  test("pending reply for deleted session is dropped quietly", () => {
    const s = createAssistantStore();
    const id = s.getState().createSession();
    s.getState().sendMessage("doomed");
    s.getState().deleteSession(id);
    expect(() => vi.advanceTimersByTime(1500)).not.toThrow();
    expect(s.getState().sessions[id]).toBeUndefined();
    expect(s.getState().pendingSessionIds[id]).toBeUndefined();
  });

  test("persists sessions and open state across instances", () => {
    const a = createAssistantStore();
    a.getState().createSession();
    a.getState().sendMessage("hi");
    vi.advanceTimersByTime(1500);
    const b = createAssistantStore();
    expect(b.getState().order.length).toBe(1);
    expect(b.getState().open).toBe(true);
    const id = b.getState().order[0]!;
    expect(b.getState().sessions[id]!.messages).toHaveLength(2);
  });

  test("pendingSessionIds is NOT persisted (cleared after reload)", () => {
    const a = createAssistantStore();
    const id = a.getState().createSession();
    a.getState().sendMessage("in flight");
    expect(a.getState().pendingSessionIds[id]).toBe(true);
    const b = createAssistantStore();
    expect(b.getState().pendingSessionIds).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/stores/assistant.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/fe/src/stores/assistant.ts`:

```ts
import { nanoid } from "nanoid";
import { useStore } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";
import { pickReply } from "#/lib/mock-replies";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type AssistantState = {
  open: boolean;
  selectedSessionId: string | null;
  sessions: Record<string, ChatSession>;
  order: string[];
  pendingSessionIds: Record<string, true>;
};

export type AssistantActions = {
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  createSession: () => string;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string) => void;
};

export type AssistantStore = AssistantState & AssistantActions;

const REPLY_DELAY_MIN = 600;
const REPLY_DELAY_MAX = 1100;

function newSession(): ChatSession {
  const now = Date.now();
  return {
    id: nanoid(8),
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function truncateForTitle(content: string, max = 60): string {
  const trimmed = content.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export function createAssistantStore(): StoreApi<AssistantStore> {
  return createStore<AssistantStore>()(
    persist(
      (set, get) => ({
        open: false,
        selectedSessionId: null,
        sessions: {},
        order: [],
        pendingSessionIds: {},

        toggleOpen: () => set((st) => ({ open: !st.open })),
        setOpen: (open) => set({ open }),

        createSession: () => {
          const s = newSession();
          set((st) => ({
            sessions: { ...st.sessions, [s.id]: s },
            order: [...st.order, s.id],
            selectedSessionId: s.id,
            open: true,
          }));
          return s.id;
        },

        selectSession: (id) => {
          if (!get().sessions[id]) return;
          set({ selectedSessionId: id, open: true });
        },

        renameSession: (id, title) => {
          const clean = title.trim();
          set((st) => {
            const existing = st.sessions[id];
            if (!existing) return st;
            return {
              sessions: {
                ...st.sessions,
                [id]: {
                  ...existing,
                  title: clean === "" ? "New chat" : clean,
                  updatedAt: Date.now(),
                },
              },
            };
          });
        },

        deleteSession: (id) => {
          set((st) => {
            if (!st.sessions[id]) return st;
            const nextSessions = { ...st.sessions };
            delete nextSessions[id];
            const nextOrder = st.order.filter((x) => x !== id);
            const nextPending = { ...st.pendingSessionIds };
            delete nextPending[id];
            const wasSelected = st.selectedSessionId === id;
            // pick next-most-recent by updatedAt
            const nextSelected = wasSelected
              ? (nextOrder
                  .slice()
                  .sort(
                    (a, b) => (nextSessions[b]?.updatedAt ?? 0) - (nextSessions[a]?.updatedAt ?? 0),
                  )[0] ?? null)
              : st.selectedSessionId;
            return {
              sessions: nextSessions,
              order: nextOrder,
              selectedSessionId: nextSelected,
              pendingSessionIds: nextPending,
            };
          });
        },

        sendMessage: (content) => {
          const trimmed = content.trim();
          if (trimmed === "") return;
          const sid = get().selectedSessionId;
          if (!sid) return;
          const session = get().sessions[sid];
          if (!session) return;

          const userMsg: ChatMessage = {
            id: nanoid(8),
            role: "user",
            content: trimmed,
            createdAt: Date.now(),
          };

          const isFirstUserMessage = session.messages.length === 0;

          set((st) => {
            const existing = st.sessions[sid];
            if (!existing) return st;
            return {
              sessions: {
                ...st.sessions,
                [sid]: {
                  ...existing,
                  messages: [...existing.messages, userMsg],
                  title: isFirstUserMessage ? truncateForTitle(trimmed) : existing.title,
                  updatedAt: userMsg.createdAt,
                },
              },
              pendingSessionIds: { ...st.pendingSessionIds, [sid]: true },
            };
          });

          const delay =
            REPLY_DELAY_MIN + Math.floor(Math.random() * (REPLY_DELAY_MAX - REPLY_DELAY_MIN));

          window.setTimeout(() => {
            const cur = get().sessions[sid];
            if (!cur) {
              // session was deleted; clean up pending and bail
              set((st) => {
                if (!st.pendingSessionIds[sid]) return st;
                const nextPending = { ...st.pendingSessionIds };
                delete nextPending[sid];
                return { pendingSessionIds: nextPending };
              });
              return;
            }
            // count user messages so reply selection cycles per-session
            const userCount = cur.messages.filter((m) => m.role === "user").length;
            const reply: ChatMessage = {
              id: nanoid(8),
              role: "assistant",
              content: pickReply(userCount - 1),
              createdAt: Date.now(),
            };
            set((st) => {
              const existing = st.sessions[sid];
              if (!existing) return st;
              const nextPending = { ...st.pendingSessionIds };
              delete nextPending[sid];
              return {
                sessions: {
                  ...st.sessions,
                  [sid]: {
                    ...existing,
                    messages: [...existing.messages, reply],
                    updatedAt: reply.createdAt,
                  },
                },
                pendingSessionIds: nextPending,
              };
            });
          }, delay);
        },
      }),
      {
        name: "patram.assistant.v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({
          open: s.open,
          selectedSessionId: s.selectedSessionId,
          sessions: s.sessions,
          order: s.order,
        }),
      },
    ),
  );
}

export const assistantStore = createAssistantStore();

export function useAssistant<T>(selector: (s: AssistantStore) => T): T {
  return useStore(assistantStore, selector);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/fe/src/stores/assistant.test.ts`
Expected: PASS, all tests in the suite.

If `vi.advanceTimersByTime(1500)` doesn't trigger the reply, double-check that `setTimeout` is reachable through `window.setTimeout` under jsdom (it is) and that `vi.useFakeTimers()` ran in `beforeEach`.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/stores/assistant.ts apps/fe/src/stores/assistant.test.ts
git commit -m "feat(fe): add persisted assistant store with mock reply timer"
```

---

## Task 4: Sidebar tabs component

**Goal:** Two-segment switcher between Docs and Sessions, wired to `uiStore`.

**Files:**

- Create: `apps/fe/src/components/sidebar/sidebar-tabs.tsx`
- Test: `apps/fe/src/components/sidebar/sidebar-tabs.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/fe/src/components/sidebar/sidebar-tabs.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { SidebarTabs } from "./sidebar-tabs";
import { uiStore } from "#/stores/ui";

describe("<SidebarTabs />", () => {
  beforeEach(() => {
    localStorage.clear();
    uiStore.setState({ sidebarTab: "docs" });
  });

  test("renders both tabs and marks the active one", () => {
    render(<SidebarTabs />);
    const docs = screen.getByRole("button", { name: "Docs" });
    const sessions = screen.getByRole("button", { name: "Sessions" });
    expect(docs.getAttribute("aria-pressed")).toBe("true");
    expect(sessions.getAttribute("aria-pressed")).toBe("false");
  });

  test("clicking sessions switches active tab", async () => {
    const user = userEvent.setup();
    render(<SidebarTabs />);
    await user.click(screen.getByRole("button", { name: "Sessions" }));
    expect(uiStore.getState().sidebarTab).toBe("sessions");
  });
});
```

If `@testing-library/user-event` isn't installed, fall back to `fireEvent.click(screen.getByRole(...))` from `@testing-library/react`. Check `apps/fe/package.json` first; install via `vp add -D @testing-library/user-event` only if necessary.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/components/sidebar/sidebar-tabs.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/fe/src/components/sidebar/sidebar-tabs.tsx`:

```tsx
import { cn } from "#/lib/utils";
import { type SidebarTab, useUi, uiStore } from "#/stores/ui";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "docs", label: "Docs" },
  { id: "sessions", label: "Sessions" },
];

export function SidebarTabs() {
  const active = useUi((s) => s.sidebarTab);
  return (
    <div className="mx-3 mb-2 flex rounded-md bg-(--paper-soft) p-0.5">
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => uiStore.getState().setSidebarTab(t.id)}
            aria-pressed={isActive}
            className={cn(
              "flex-1 rounded px-2 py-1 text-[12px] transition",
              isActive
                ? "bg-(--paper) text-(--ink) shadow-[0_0_0_1px_var(--rule)]"
                : "text-(--ink-faint) hover:text-(--ink-soft)",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/fe/src/components/sidebar/sidebar-tabs.test.tsx`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/sidebar/sidebar-tabs.tsx apps/fe/src/components/sidebar/sidebar-tabs.test.tsx
git commit -m "feat(fe): add sidebar tabs switcher (docs | sessions)"
```

---

## Task 5: Extract DocsList from Sidebar

**Goal:** Move today's sidebar body (search + new-doc + doc rows) into a standalone `DocsList` component without behavior changes. This sets up Task 7 cleanly.

**Files:**

- Create: `apps/fe/src/components/sidebar/docs-list.tsx`
- Modify: `apps/fe/src/components/sidebar/sidebar.tsx`

- [ ] **Step 1: Create DocsList from existing sidebar markup**

Create `apps/fe/src/components/sidebar/docs-list.tsx`:

```tsx
import { Plus, Search } from "lucide-react";
import { useDocuments } from "#/stores/documents";
import { DocRow } from "./doc-row";
import { SidebarSection } from "./sidebar-section";

export function DocsList() {
  const order = useDocuments((s) => s.order);
  const docs = useDocuments((s) => s.docs);
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const createDoc = useDocuments((s) => s.createDoc);

  const sortedIds = [...order].sort((a, b) => {
    const da = docs[a]?.updatedAt ?? 0;
    const db = docs[b]?.updatedAt ?? 0;
    return db - da;
  });

  return (
    <>
      <div className="px-3 pt-1 pb-2">
        <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-(--ink-faint) hover:bg-(--paper-soft)">
          <Search className="size-3.5" />
          <input
            type="text"
            placeholder="Search documents"
            aria-label="Search documents"
            className="w-full bg-transparent text-(--ink) placeholder:text-(--ink-faint) focus:outline-none"
          />
        </label>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => createDoc()}
          aria-label="New document"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)"
        >
          <Plus className="size-3.5" />
          <span>New document</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        <SidebarSection label="Documents" count={sortedIds.length}>
          {sortedIds.map((id) => {
            const d = docs[id];
            if (!d) return null;
            return (
              <DocRow
                key={id}
                title={d.title}
                active={selectedId === id}
                onClick={() => selectDoc(id)}
              />
            );
          })}
        </SidebarSection>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace inline body in `sidebar.tsx` with `<DocsList />`**

Edit `apps/fe/src/components/sidebar/sidebar.tsx`:

Replace the `<>...</>` block currently containing the search/new-doc/list markup (between the brand row and `<UserChip />`) with `<DocsList />`. Remove now-unused imports (`Plus`, `Search`, `DocRow`, `SidebarSection`, plus the `useDocuments` calls). Keep `PanelLeftClose`, `PanelLeftOpen`, `cn`, and `UserChip`.

After the edit, `sidebar.tsx` should look like:

```tsx
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "#/lib/utils";
import { DocsList } from "./docs-list";
import { UserChip } from "./user-chip";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-(--rule) bg-(--paper) transition-[width] duration-200",
        collapsed ? "w-0 border-r-0" : "w-60",
      )}
    >
      {!collapsed && (
        <>
          <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3">
            <span className="text-[14px] font-semibold tracking-tight text-(--ink)">Patram</span>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Collapse sidebar"
              className="-mr-1 inline-flex size-6 items-center justify-center rounded-md text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)"
            >
              <PanelLeftClose className="size-3.5" />
            </button>
          </div>
          <DocsList />
          <UserChip name="Saket" />
        </>
      )}
      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="fixed top-3 left-3 z-10 inline-flex size-7 items-center justify-center rounded-md border border-(--rule) bg-(--paper) text-(--ink-soft) hover:bg-(--paper-soft)"
        >
          <PanelLeftOpen className="size-3.5" />
        </button>
      )}
    </aside>
  );
}
```

- [ ] **Step 3: Run existing app-shell tests to confirm no regression**

Run: `vp test apps/fe/src/components/app-shell.test.tsx`
Expected: PASS — same `Patram`, search field, "New document" button, seeded doc titles still visible.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/sidebar/docs-list.tsx apps/fe/src/components/sidebar/sidebar.tsx
git commit -m "refactor(fe): extract DocsList from Sidebar"
```

---

## Task 6: Session row component

**Goal:** Single session row with title, last-updated time, dropdown delete.

**Files:**

- Create: `apps/fe/src/components/sidebar/session-row.tsx`

- [ ] **Step 1: Implement SessionRow**

Create `apps/fe/src/components/sidebar/session-row.tsx`:

```tsx
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { formatRelativeTime } from "#/lib/format-time";
import { cn } from "#/lib/utils";

export function SessionRow({
  title,
  updatedAt,
  active,
  onClick,
  onDelete,
}: {
  title: string;
  updatedAt: number;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group mx-2 my-px flex w-[calc(100%-1rem)] items-center rounded-md px-2 py-1.5 text-[13px] transition",
        active
          ? "bg-(--selection) font-medium text-(--ink)"
          : "text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-2 overflow-hidden text-left"
      >
        <span className="truncate">{title || "New chat"}</span>
        <span className="ml-auto shrink-0 text-[11px] text-(--ink-faint)">
          {formatRelativeTime(updatedAt)}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Session actions"
            onClick={(e) => e.stopPropagation()}
            className="ml-1 inline-flex size-5 items-center justify-center rounded text-(--ink-faint) opacity-0 hover:bg-(--paper) group-hover:opacity-100"
          >
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: Sanity-check by running existing tests (no new test added here — covered in Task 7)**

Run: `vp test apps/fe`
Expected: PASS, no regressions.

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/sidebar/session-row.tsx
git commit -m "feat(fe): add SessionRow with delete dropdown"
```

---

## Task 7: SessionsList + wire sidebar to active tab

**Goal:** Render sessions list when the Sessions tab is active. New-chat button on top.

**Files:**

- Create: `apps/fe/src/components/sidebar/sessions-list.tsx`
- Modify: `apps/fe/src/components/sidebar/sidebar.tsx`
- Modify: `apps/fe/src/components/app-shell.test.tsx` (optional sanity assertions)

- [ ] **Step 1: Implement SessionsList**

Create `apps/fe/src/components/sidebar/sessions-list.tsx`:

```tsx
import { Plus } from "lucide-react";
import { assistantStore, useAssistant } from "#/stores/assistant";
import { SessionRow } from "./session-row";
import { SidebarSection } from "./sidebar-section";

export function SessionsList() {
  const order = useAssistant((s) => s.order);
  const sessions = useAssistant((s) => s.sessions);
  const selected = useAssistant((s) => s.selectedSessionId);

  const sortedIds = [...order].sort((a, b) => {
    const da = sessions[a]?.updatedAt ?? 0;
    const db = sessions[b]?.updatedAt ?? 0;
    return db - da;
  });

  return (
    <>
      <div className="px-3 pt-1 pb-3">
        <button
          type="button"
          onClick={() => assistantStore.getState().createSession()}
          aria-label="New chat"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)"
        >
          <Plus className="size-3.5" />
          <span>New chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        <SidebarSection label="Sessions" count={sortedIds.length}>
          {sortedIds.map((id) => {
            const s = sessions[id];
            if (!s) return null;
            return (
              <SessionRow
                key={id}
                title={s.title}
                updatedAt={s.updatedAt}
                active={selected === id}
                onClick={() => assistantStore.getState().selectSession(id)}
                onDelete={() => assistantStore.getState().deleteSession(id)}
              />
            );
          })}
        </SidebarSection>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire `Sidebar` to render tabs and switch lists**

Edit `apps/fe/src/components/sidebar/sidebar.tsx` so the body uses `SidebarTabs` and switches between `DocsList` and `SessionsList` based on `useUi((s) => s.sidebarTab)`:

```tsx
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "#/lib/utils";
import { useUi } from "#/stores/ui";
import { DocsList } from "./docs-list";
import { SessionsList } from "./sessions-list";
import { SidebarTabs } from "./sidebar-tabs";
import { UserChip } from "./user-chip";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const tab = useUi((s) => s.sidebarTab);
  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-(--rule) bg-(--paper) transition-[width] duration-200",
        collapsed ? "w-0 border-r-0" : "w-60",
      )}
    >
      {!collapsed && (
        <>
          <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3">
            <span className="text-[14px] font-semibold tracking-tight text-(--ink)">Patram</span>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Collapse sidebar"
              className="-mr-1 inline-flex size-6 items-center justify-center rounded-md text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)"
            >
              <PanelLeftClose className="size-3.5" />
            </button>
          </div>
          <SidebarTabs />
          {tab === "docs" ? <DocsList /> : <SessionsList />}
          <UserChip name="Saket" />
        </>
      )}
      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="fixed top-3 left-3 z-10 inline-flex size-7 items-center justify-center rounded-md border border-(--rule) bg-(--paper) text-(--ink-soft) hover:bg-(--paper-soft)"
        >
          <PanelLeftOpen className="size-3.5" />
        </button>
      )}
    </aside>
  );
}
```

- [ ] **Step 3: Add sanity test for tab switching in app-shell**

Append to `apps/fe/src/components/app-shell.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";
import { uiStore } from "#/stores/ui";

// inside the existing describe block, after the existing tests:
test("switching to Sessions tab shows the New chat button", () => {
  localStorage.clear();
  uiStore.setState({ sidebarTab: "docs" });
  render(<AppShell />);
  fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
  screen.getByRole("button", { name: /new chat/i });
});
```

(Adjust imports at the top of the file if `fireEvent` and `uiStore` are not yet imported.)

- [ ] **Step 4: Run all FE tests**

Run: `vp test apps/fe`
Expected: PASS, including the new tab-switch sanity test.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/sidebar/sessions-list.tsx apps/fe/src/components/sidebar/sidebar.tsx apps/fe/src/components/app-shell.test.tsx
git commit -m "feat(fe): wire sidebar tabs to docs/sessions lists"
```

---

## Task 8: Composer

**Goal:** Auto-grow textarea + send button. Enter sends, Shift+Enter newlines, empty disables send.

**Files:**

- Create: `apps/fe/src/components/assistant/composer.tsx`

- [ ] **Step 1: Implement Composer**

Create `apps/fe/src/components/assistant/composer.tsx`:

```tsx
import { ArrowUp } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "#/lib/utils";

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // auto-grow up to ~6 lines
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 6 * 20; // ~6 lines at ~20px each
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  const canSend = !disabled && value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue("");
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="border-t border-(--rule) p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="relative flex items-end gap-2 rounded-md border border-(--rule) bg-(--paper) px-3 py-2 focus-within:border-(--rule-strong)">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything…"
          aria-label="Message"
          className="max-h-30 min-h-[20px] flex-1 resize-none bg-transparent text-[13px] text-(--ink) placeholder:text-(--ink-faint) focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded transition",
            canSend
              ? "bg-(--ink) text-(--paper) hover:opacity-90"
              : "bg-(--paper-soft) text-(--ink-faint)",
          )}
        >
          <ArrowUp className="size-3.5" />
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Run all FE tests for regression**

Run: `vp test apps/fe`
Expected: PASS — no test relies on this yet.

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/assistant/composer.tsx
git commit -m "feat(fe): add assistant Composer with auto-grow textarea"
```

---

## Task 9: MessageBubble + MessageList

**Goal:** Render the conversation. Auto-scroll to bottom on new messages. Empty state. Typing indicator.

**Files:**

- Create: `apps/fe/src/components/assistant/message-bubble.tsx`
- Create: `apps/fe/src/components/assistant/message-list.tsx`

- [ ] **Step 1: Implement MessageBubble**

Create `apps/fe/src/components/assistant/message-bubble.tsx`:

```tsx
import { cn } from "#/lib/utils";
import type { ChatRole } from "#/stores/assistant";

export function MessageBubble({ role, content }: { role: ChatRole; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-md px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
          isUser ? "bg-(--paper-soft) text-(--ink)" : "text-(--ink)",
        )}
      >
        {content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement MessageList**

Create `apps/fe/src/components/assistant/message-list.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { ChatMessage } from "#/stores/assistant";
import { MessageBubble } from "./message-bubble";

export function MessageList({
  sessionId,
  messages,
  pending,
}: {
  sessionId: string;
  messages: ChatMessage[];
  pending: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll on new messages, on pending change, and on session switch
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, sessionId]);

  if (messages.length === 0 && !pending) {
    return (
      <div
        ref={scrollRef}
        className="flex flex-1 items-center justify-center text-[13px] text-(--ink-faint)"
      >
        Start a conversation
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} role={m.role} content={m.content} />
      ))}
      {pending && (
        <div className="flex w-full justify-start" aria-label="Assistant is typing">
          <div className="rounded-md px-3 py-2 text-[13px] text-(--ink-faint)">
            <span className="inline-flex gap-1">
              <span className="size-1 animate-pulse rounded-full bg-current" />
              <span
                className="size-1 animate-pulse rounded-full bg-current"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="size-1 animate-pulse rounded-full bg-current"
                style={{ animationDelay: "240ms" }}
              />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run all FE tests**

Run: `vp test apps/fe`
Expected: PASS, no regressions.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/assistant/message-bubble.tsx apps/fe/src/components/assistant/message-list.tsx
git commit -m "feat(fe): add MessageBubble + MessageList with typing indicator"
```

---

## Task 10: AssistantPanel (header + body) and behavior tests

**Goal:** Final assembly. Header with rename + close, MessageList, Composer. Auto-creates a session on first open.

**Files:**

- Create: `apps/fe/src/components/assistant/assistant-panel.tsx`
- Create: `apps/fe/src/components/assistant/assistant-panel.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `apps/fe/src/components/assistant/assistant-panel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { assistantStore } from "#/stores/assistant";
import { AssistantPanel } from "./assistant-panel";

describe("<AssistantPanel />", () => {
  beforeEach(() => {
    localStorage.clear();
    assistantStore.setState({
      open: true,
      selectedSessionId: null,
      sessions: {},
      order: [],
      pendingSessionIds: {},
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("auto-creates a session on mount when none exists", () => {
    render(<AssistantPanel />);
    expect(assistantStore.getState().order.length).toBe(1);
    screen.getByText("Start a conversation");
  });

  test("typing + Enter sends a user message and shows the assistant reply after the timer", () => {
    render(<AssistantPanel />);
    const ta = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "hello" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    screen.getByText("hello");
    expect(ta.value).toBe("");

    vi.advanceTimersByTime(1500);

    const sid = assistantStore.getState().selectedSessionId!;
    const msgs = assistantStore.getState().sessions[sid]!.messages;
    expect(msgs).toHaveLength(2);
    screen.getByText(msgs[1]!.content);
  });

  test("Shift+Enter does NOT send", () => {
    render(<AssistantPanel />);
    const ta = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "draft" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    const sid = assistantStore.getState().selectedSessionId!;
    expect(assistantStore.getState().sessions[sid]!.messages).toHaveLength(0);
  });

  test("send button is disabled for empty/whitespace input", () => {
    render(<AssistantPanel />);
    const send = screen.getByLabelText("Send message") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const ta = screen.getByLabelText("Message");
    fireEvent.change(ta, { target: { value: "   " } });
    expect(send.disabled).toBe(true);
    fireEvent.change(ta, { target: { value: "ok" } });
    expect(send.disabled).toBe(false);
  });

  test("close button sets open=false", () => {
    render(<AssistantPanel />);
    fireEvent.click(screen.getByLabelText("Close assistant"));
    expect(assistantStore.getState().open).toBe(false);
  });

  test("renaming via header updates session title", () => {
    render(<AssistantPanel />);
    fireEvent.click(screen.getByLabelText("Rename session"));
    const input = screen.getByLabelText("Session title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const sid = assistantStore.getState().selectedSessionId!;
    expect(assistantStore.getState().sessions[sid]!.title).toBe("Renamed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/fe/src/components/assistant/assistant-panel.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement AssistantPanel**

Create `apps/fe/src/components/assistant/assistant-panel.tsx`:

```tsx
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { assistantStore, useAssistant } from "#/stores/assistant";
import { Composer } from "./composer";
import { MessageList } from "./message-list";

export function AssistantPanel() {
  const open = useAssistant((s) => s.open);
  const sessionId = useAssistant((s) => s.selectedSessionId);
  const session = useAssistant((s) =>
    s.selectedSessionId ? s.sessions[s.selectedSessionId] : null,
  );
  const pending = useAssistant((s) =>
    s.selectedSessionId ? Boolean(s.pendingSessionIds[s.selectedSessionId]) : false,
  );

  // Auto-create a session on first open if none exists.
  useEffect(() => {
    if (open && !sessionId) {
      assistantStore.getState().createSession();
    }
  }, [open, sessionId]);

  if (!session || !sessionId) {
    // Brief frame between mount and effect; render header skeleton.
    return <PanelChrome />;
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        sessionId={sessionId}
        title={session.title}
        onClose={() => assistantStore.getState().setOpen(false)}
      />
      <MessageList sessionId={sessionId} messages={session.messages} pending={pending} />
      <Composer disabled={pending} onSend={(text) => assistantStore.getState().sendMessage(text)} />
    </div>
  );
}

function PanelChrome() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center border-b border-(--rule) px-4" />
    </div>
  );
}

function PanelHeader({
  sessionId,
  title,
  onClose,
}: {
  sessionId: string;
  title: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  // Reset draft when session or external title changes.
  useEffect(() => {
    setDraft(title);
    setEditing(false);
  }, [sessionId, title]);

  const commit = () => {
    assistantStore.getState().renameSession(sessionId, draft);
    setEditing(false);
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-(--rule) px-4">
      {editing ? (
        <input
          autoFocus
          aria-label="Session title"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="flex-1 bg-transparent text-[13px] font-medium text-(--ink) focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename session"
          className="flex-1 truncate text-left text-[13px] font-medium text-(--ink) hover:text-(--ink-soft)"
        >
          {title}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close assistant"
        className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)"
      >
        <X className="size-3.5" />
      </button>
    </header>
  );
}
```

- [ ] **Step 4: Run the assistant-panel tests**

Run: `vp test apps/fe/src/components/assistant/assistant-panel.test.tsx`
Expected: PASS, all 6 tests.

If the "auto-creates a session on mount" test sees `order.length === 0`, the effect timing may be off — wrap the assertion in a `waitFor` from `@testing-library/react` (`await waitFor(() => expect(...).toBe(1))`) and mark the test `async`.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/assistant/assistant-panel.tsx apps/fe/src/components/assistant/assistant-panel.test.tsx
git commit -m "feat(fe): assemble AssistantPanel (header, list, composer)"
```

---

## Task 11: Topbar toggle button

**Goal:** Add a sparkle icon button on the left of the Topbar that toggles the assistant. Active when open.

**Files:**

- Modify: `apps/fe/src/components/topbar.tsx`

- [ ] **Step 1: Edit Topbar**

Replace `apps/fe/src/components/topbar.tsx` with:

```tsx
import { MoreHorizontal, Sparkles } from "lucide-react";
import { SaveStatus } from "#/components/save-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";
import { assistantStore, useAssistant } from "#/stores/assistant";
import { useDocuments } from "#/stores/documents";

export function Topbar({ saveState }: { saveState: "idle" | "saving" }) {
  const selectedId = useDocuments((s) => s.selectedId);
  const doc = useDocuments((s) => (s.selectedId ? s.docs[s.selectedId] : null));
  const deleteDoc = useDocuments((s) => s.deleteDoc);
  const assistantOpen = useAssistant((s) => s.open);

  const toggleAssistant = () => assistantStore.getState().toggleOpen();

  if (!doc || !selectedId) {
    return (
      <header className="flex h-11 items-center border-b border-(--rule) px-3">
        <AssistantToggle open={assistantOpen} onClick={toggleAssistant} />
      </header>
    );
  }

  return (
    <header className="flex h-11 items-center gap-3 border-b border-(--rule) px-3">
      <AssistantToggle open={assistantOpen} onClick={toggleAssistant} />
      <h1 className="truncate text-[13px] font-medium text-(--ink)">{doc.title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <SaveStatus state={saveState} savedAt={doc.updatedAt} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem variant="destructive" onSelect={() => deleteDoc(selectedId)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function AssistantToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle assistant"
      aria-pressed={open}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md transition",
        open
          ? "bg-(--paper-soft) text-(--ink)"
          : "text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)",
      )}
    >
      <Sparkles className="size-3.5" />
    </button>
  );
}
```

- [ ] **Step 2: Run app-shell tests**

Run: `vp test apps/fe/src/components/app-shell.test.tsx`
Expected: PASS — existing `Patram`, search, new-doc, and seeded-doc assertions still hold.

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/topbar.tsx
git commit -m "feat(fe): add assistant toggle button to Topbar"
```

---

## Task 12: AppShell layout split + Ctrl+/ shortcut

**Goal:** Rewire `AppShell` so Main contains Topbar over a flex content row with `AssistantPanel` (animated width) and the existing editor area. Wire `Cmd/Ctrl+/`.

**Files:**

- Modify: `apps/fe/src/components/app-shell.tsx`
- Modify: `apps/fe/src/components/app-shell.test.tsx`

- [ ] **Step 1: Update the failing layout tests**

Edit `apps/fe/src/components/app-shell.test.tsx` to add layout + shortcut tests. Replace the file with:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { AppShell } from "./app-shell";
import { assistantStore } from "#/stores/assistant";
import { uiStore } from "#/stores/ui";

describe("<AppShell />", () => {
  beforeEach(() => {
    localStorage.clear();
    assistantStore.setState({
      open: false,
      selectedSessionId: null,
      sessions: {},
      order: [],
      pendingSessionIds: {},
    });
    uiStore.setState({ sidebarTab: "docs" });
  });
  afterEach(() => {
    localStorage.clear();
  });

  test("mounts with brand, search, and new-doc button", () => {
    render(<AppShell />);
    screen.getByText("Patram");
    screen.getByLabelText(/search documents/i);
    screen.getByRole("button", { name: /new document/i });
  });

  test("shows seeded documents in the sidebar", () => {
    render(<AppShell />);
    screen.getByText("Onboarding notes");
    screen.getByText("Product principles");
  });

  test("switching to Sessions tab shows the New chat button", () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    screen.getByRole("button", { name: /new chat/i });
  });

  test("Topbar assistant toggle opens and closes the panel", () => {
    render(<AppShell />);
    expect(assistantStore.getState().open).toBe(false);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(true);
    fireEvent.click(screen.getByLabelText("Toggle assistant"));
    expect(assistantStore.getState().open).toBe(false);
  });

  test("Ctrl+/ toggles the assistant; Ctrl+\\ does not", () => {
    render(<AppShell />);
    expect(assistantStore.getState().open).toBe(false);
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(assistantStore.getState().open).toBe(true);
    // Ctrl+\\ toggles sidebar, not assistant
    fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
    expect(assistantStore.getState().open).toBe(true);
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(assistantStore.getState().open).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm failures**

Run: `vp test apps/fe/src/components/app-shell.test.tsx`
Expected: FAIL — toggle button not yet in test environment with the assistant store reset state, OR shortcut not yet wired (depending on order in which the suite runs).

- [ ] **Step 3: Update AppShell to split layout and wire shortcut**

Replace `apps/fe/src/components/app-shell.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { AssistantPanel } from "#/components/assistant/assistant-panel";
import { DocSurface } from "#/components/doc/doc-surface";
import { Sidebar } from "#/components/sidebar/sidebar";
import { Topbar } from "#/components/topbar";
import { cn } from "#/lib/utils";
import { assistantStore, useAssistant } from "#/stores/assistant";

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 960;
  });
  const [saving, setSaving] = useState(false);
  const assistantOpen = useAssistant((s) => s.open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        assistantStore.getState().toggleOpen();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid h-screen w-screen grid-cols-[auto_1fr] overflow-hidden bg-(--paper)">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
      <main className="flex h-screen min-w-0 flex-col overflow-hidden">
        <Topbar saveState={saving ? "saving" : "idle"} />
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Assistant"
            className={cn(
              "flex h-full overflow-hidden border-r border-(--rule) bg-(--paper) transition-[width,opacity] duration-200 ease-out",
              assistantOpen ? "w-1/2 opacity-100" : "w-0 border-r-0 opacity-0",
            )}
          >
            <div className="h-full w-full">{assistantOpen && <AssistantPanel />}</div>
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto">
            <DocSurface onSavingChange={setSaving} />
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run all FE tests**

Run: `vp test apps/fe`
Expected: PASS, including all new app-shell tests.

If the `Ctrl+/` test sees `open === true` after Ctrl+\, that means the sidebar shortcut handler is also matching `/` — it isn't, but verify by reading the handler. If both `/` and `\\` toggle assistant, the conditional ordering is wrong.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/app-shell.tsx apps/fe/src/components/app-shell.test.tsx
git commit -m "feat(fe): split content area for assistant panel + Ctrl+/ shortcut"
```

---

## Task 13: Type-check, lint, full test pass, and manual smoke

**Goal:** Verify the full stack and manually confirm the layout transitions feel right.

- [ ] **Step 1: Run repo-wide check**

Run: `vp check`
Expected: PASS — no lint or type errors. If `oxlint` flags unused imports in `sidebar.tsx` from Task 5's refactor, remove them now.

- [ ] **Step 2: Run all tests**

Run: `vp test -r`
Expected: PASS across the workspace.

- [ ] **Step 3: Manual smoke (FE dev server)**

Run: `vp run fe#dev`

In the browser at the printed URL:

- Click the sparkle icon in the topbar — assistant panel slides in from the left, takes ~half the content area, editor stays visible on the right at the same reading width.
- Click again — panel slides out, editor returns to centered position.
- Press `Ctrl+/` (or `Cmd+/` on macOS) — same toggle behavior.
- Press `Ctrl+\` — sidebar collapses; press again to expand.
- Type a message in the assistant composer, press Enter — user bubble appears immediately, "typing" indicator shows, ~1s later an assistant bubble appears.
- Press Shift+Enter — new line in textarea, no send.
- Click "Sessions" tab in the sidebar — sessions list appears with the current session row at the top.
- Click "+ New chat" — new session appears, panel switches to it (empty state).
- Switch back to the first session via the sidebar — its messages reappear.
- Send a message in session A, immediately switch to session B; after the timer, switch back to A — the assistant reply landed in A.
- Reload the page — the panel is still open on the same session, with the same messages.
- Delete the active session via the row dropdown — selection moves to the next-most-recent session, or panel auto-creates a new "New chat" if it was the last.

- [ ] **Step 4: Commit any cleanups discovered during smoke**

If any minor tweaks were needed (e.g. spacing, tightening a hover state), commit them as a small follow-up:

```bash
git add -A
git commit -m "chore(fe): polish assistant panel after smoke test"
```

If no changes were needed, skip this step.

---

## Self-Review Notes

The following checks were performed against the spec before publishing this plan:

1. **Spec coverage:**
   - Layout (§4): Task 12.
   - Animation (§4.3): Task 12 (the `transition-[width,opacity] duration-200 ease-out` on the aside).
   - Trigger (§5): Topbar button — Task 11; `Ctrl+/` — Task 12; sidebar session-row open behavior — Task 7 (via `selectSession` setting `open: true`); session-create open behavior — Tasks 6/7 + 3.
   - AssistantPanel UI (§6): Tasks 8, 9, 10.
   - Mock reply behavior (§7): Tasks 1, 3.
   - Sidebar tabs (§8): Tasks 4, 5, 6, 7.
   - Data model & state (§9): Tasks 2, 3.

2. **Spec refinement:** `pendingSessionIds: Record<string, true>` instead of single `pending: boolean` — documented at the top of this plan and reflected in store + tests + panel.

3. **Type consistency:** All store types (`ChatRole`, `ChatMessage`, `ChatSession`, `AssistantStore`) are defined in Task 3 and re-imported by name in Tasks 9, 10. All action signatures (`createSession`, `selectSession`, `renameSession`, `deleteSession`, `sendMessage`, `toggleOpen`, `setOpen`) are stable across tasks.

4. **No placeholders:** All steps include code; all commands include expected outcomes.
