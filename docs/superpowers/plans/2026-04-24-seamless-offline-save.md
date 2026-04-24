# Seamless, Offline-Friendly Section Saves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current section-save pipeline with a calm idle-debounce + blur/unload flush + localStorage safety net. Sideline optimistic version checking — make `expectedVersion` optional server-side and stop sending it from the client.

**Architecture:** Backend accepts PATCH `/sections/:id` with or without `expectedVersion` (conflict branch gated on presence; `version` still increments). Frontend introduces a single `useSectionSave` hook that owns debounced save, blur/unmount flush, `beforeunload` sendBeacon, exponential-backoff retry, and localStorage mirror-and-recover. `SectionBlock` shrinks into a thin adapter around the hook.

**Tech Stack:** Hono + Drizzle (BE), React 19 + Tiptap 3 + TanStack Query + TanStack Router SPA (FE), Vite+ toolchain (`vp check`, `vp test`, `vp build`), Vitest with MSW for FE test doubles. Spec: `docs/superpowers/specs/2026-04-24-seamless-offline-save-design.md`.

---

## File Structure

**Create**

- `apps/fe/src/lib/section-save-store.ts` — typed localStorage wrapper (`getLocalSnapshot`, `putLocalSnapshot`, `clearLocalSnapshot`).
- `apps/fe/src/lib/section-save-store.test.ts` — unit tests for the wrapper.
- `apps/fe/src/lib/use-section-save.ts` — hook owning the full save lifecycle.
- `apps/fe/src/lib/use-section-save.test.tsx` — hook integration tests (MSW + fake timers).

**Modify**

- `apps/be/src/services/section-write.ts` — `expectedVersion` becomes optional; version-check gated on presence.
- `apps/be/src/routes/sections.ts` — validator marks `expectedVersion` optional; handler still honors it when present.
- `apps/be/src/routes/sections.test.ts` — add "PATCH without expectedVersion succeeds" case.
- `apps/fe/src/lib/section-save-state.ts` — drop `conflict` status and action.
- `apps/fe/src/lib/section-save-state.test.ts` — remove the two `conflict`-related tests.
- `apps/fe/src/queries/sections.ts` — `UpdateSectionInput.expectedVersion` optional.
- `apps/fe/src/queries/sections.test.tsx` — remove the 409 test; keep the success test and drop `expectedVersion` from the payload.
- `apps/fe/src/components/doc/save-state-pip.tsx` — drop `conflict` case; add 400ms grace for "saving" spinner.
- `apps/fe/src/components/doc/section-block.tsx` — consume `useSectionSave`; lift editor into state; pass `initialContent` through.
- `apps/fe/src/components/doc/section-block.test.tsx` — add mount-with-localStorage-snapshot cases.
- `apps/fe/src/components/editor/editor.tsx` — `initialContent` already a prop; no change expected but verify during Task 6.

---

## Task 1: Backend — make `expectedVersion` optional

**Files:**

- Modify: `apps/be/src/services/section-write.ts`
- Modify: `apps/be/src/routes/sections.ts`
- Test: `apps/be/src/routes/sections.test.ts`

- [ ] **Step 1: Add failing test for PATCH without `expectedVersion`**

Append to `apps/be/src/routes/sections.test.ts` (inside the existing `describe("sections routes", ...)` block):

```ts
it("PATCH without expectedVersion applies write and bumps version", async () => {
  const created = await app.request(`/documents/${docId}/sections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const section = (await created.json()) as { id: string; version: number };
  const res = await app.request(`/sections/${section.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "no-version" }] }],
      },
    }),
  });
  expect(res.status).toBe(200);
  const updated = (await res.json()) as { version: number; contentText: string };
  expect(updated.version).toBe(section.version + 1);
  expect(updated.contentText).toBe("no-version");
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run: `cd apps/be && vp test -t "PATCH without expectedVersion"`
Expected: FAIL — the current validator rejects the body because `expectedVersion` is required.

- [ ] **Step 3: Loosen the service to treat `expectedVersion` as optional**

Edit `apps/be/src/services/section-write.ts`. Replace the `UpdateSectionInput` type and the top of `updateSection` with:

```ts
export type UpdateSectionInput = {
  sectionId: string;
  expectedVersion?: number;
  userId: string;
  patch: {
    contentJson?: unknown;
    label?: string | null;
    kind?: SectionKind;
    frontmatter?: Record<string, unknown>;
    orderKey?: string;
  };
};
```

Then update the transaction body so the conflict branch only runs when `expectedVersion` is defined:

```ts
return db.transaction(async (tx) => {
  const [current] = await tx
    .select({ version: sections.version, documentId: sections.documentId })
    .from(sections)
    .where(eq(sections.id, input.sectionId));
  if (!current) throw new Error("Section not found");
  if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
    throw new VersionConflictError(current.version);
  }
  const [doc] = await tx
    .select({ workspaceId: documents.workspaceId })
    .from(documents)
    .where(eq(documents.id, current.documentId));
  if (!doc) throw new Error("Document not found");

  const setPatch: Record<string, unknown> = {
    version: sql`${sections.version} + 1`,
    updatedBy: input.userId,
    updatedAt: sql`now()`,
  };
  if (input.patch.label !== undefined) setPatch.label = input.patch.label;
  if (input.patch.kind !== undefined) setPatch.kind = input.patch.kind;
  if (input.patch.frontmatter !== undefined) setPatch.frontmatter = input.patch.frontmatter;
  if (input.patch.orderKey !== undefined) setPatch.orderKey = input.patch.orderKey;
  if (derived) {
    setPatch.contentJson = derived.canonicalJson;
    setPatch.contentText = derived.contentText;
    setPatch.contentHash = derived.contentHash;
  }

  const whereClause =
    input.expectedVersion !== undefined
      ? and(eq(sections.id, input.sectionId), eq(sections.version, input.expectedVersion))
      : eq(sections.id, input.sectionId);

  const [updated] = await tx.update(sections).set(setPatch).where(whereClause).returning();
  if (!updated) {
    const [latest] = await tx
      .select({ version: sections.version })
      .from(sections)
      .where(eq(sections.id, input.sectionId));
    throw new VersionConflictError(latest?.version ?? current.version);
  }

  if (derived) {
    await tx.delete(sectionLinks).where(eq(sectionLinks.sourceSectionId, input.sectionId));
    const allowed = await filterLinksToWorkspace(tx, doc.workspaceId, derived.links);
    if (allowed.length > 0) {
      await tx.insert(sectionLinks).values(
        allowed.map((l) => ({
          sourceSectionId: input.sectionId,
          targetDocumentId: l.targetDocumentId,
          targetSectionId: l.targetSectionId,
        })),
      );
    }
  }

  return updated;
});
```

- [ ] **Step 4: Loosen the route validator**

Edit `apps/be/src/routes/sections.ts`. Change `patchBody` to:

```ts
const patchBody = z.object({
  expectedVersion: z.number().int().positive().optional(),
  contentJson: z.unknown().optional(),
  label: z.string().nullable().optional(),
  kind: z.enum(["prose", "list", "table", "code", "callout", "embed"]).optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  orderKey: z.string().optional(),
});
```

The PATCH handler already passes `body.expectedVersion` straight through; no handler change needed — `undefined` flows cleanly into the service.

- [ ] **Step 5: Run the full route test file and confirm all pass**

Run: `cd apps/be && vp test sections.test`
Expected: PASS — the new case plus the existing three PATCH cases (correct version, stale version → 409, foreign workspace → 404).

- [ ] **Step 6: Commit**

```bash
git add apps/be/src/services/section-write.ts apps/be/src/routes/sections.ts apps/be/src/routes/sections.test.ts
git commit -m "feat(be): make section PATCH expectedVersion optional

Conflict branch is gated on presence; version still increments on
every write. Preserves 409 behavior for callers that still send
expectedVersion."
```

---

## Task 2: Frontend — `section-save-store` localStorage wrapper

**Files:**

- Create: `apps/fe/src/lib/section-save-store.ts`
- Create: `apps/fe/src/lib/section-save-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/fe/src/lib/section-save-store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { getLocalSnapshot, putLocalSnapshot, clearLocalSnapshot } from "./section-save-store";

describe("section-save-store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  test("round-trips a snapshot under patram:section:<id>", () => {
    const snap = {
      contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      savedAt: 1000,
    };
    putLocalSnapshot("s1", snap);
    expect(window.localStorage.getItem("patram:section:s1")).not.toBeNull();
    expect(getLocalSnapshot("s1")).toEqual(snap);
  });

  test("returns null when no snapshot present", () => {
    expect(getLocalSnapshot("missing")).toBeNull();
  });

  test("returns null and does not throw when stored value is malformed", () => {
    window.localStorage.setItem("patram:section:bad", "not-json");
    expect(getLocalSnapshot("bad")).toBeNull();
  });

  test("clearLocalSnapshot removes the entry", () => {
    putLocalSnapshot("s1", { contentJson: {}, savedAt: 1 });
    clearLocalSnapshot("s1");
    expect(getLocalSnapshot("s1")).toBeNull();
  });

  test("putLocalSnapshot silently no-ops when setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => putLocalSnapshot("s1", { contentJson: {}, savedAt: 1 })).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  test("getLocalSnapshot silently returns null when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(getLocalSnapshot("s1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/fe && vp test section-save-store`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the store**

Create `apps/fe/src/lib/section-save-store.ts`:

```ts
import type { JSONContent } from "@tiptap/react";

export type LocalSnapshot = {
  contentJson: JSONContent;
  savedAt: number;
};

const keyFor = (sectionId: string) => `patram:section:${sectionId}`;

export function getLocalSnapshot(sectionId: string): LocalSnapshot | null {
  try {
    const raw = window.localStorage.getItem(keyFor(sectionId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as LocalSnapshot;
    if (typeof parsed?.savedAt !== "number" || typeof parsed?.contentJson !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function putLocalSnapshot(sectionId: string, snap: LocalSnapshot): void {
  try {
    window.localStorage.setItem(keyFor(sectionId), JSON.stringify(snap));
  } catch {
    // Quota exceeded / unavailable storage: safety net is best-effort.
  }
}

export function clearLocalSnapshot(sectionId: string): void {
  try {
    window.localStorage.removeItem(keyFor(sectionId));
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/fe && vp test section-save-store`
Expected: PASS — six tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/section-save-store.ts apps/fe/src/lib/section-save-store.test.ts
git commit -m "feat(fe): add section-save-store localStorage wrapper

Best-effort read/write/clear for per-section content snapshots.
Silently degrades when storage is unavailable or full."
```

---

## Task 3: Frontend — drop `conflict` from section-save state

**Files:**

- Modify: `apps/fe/src/lib/section-save-state.ts`
- Modify: `apps/fe/src/lib/section-save-state.test.ts`

- [ ] **Step 1: Update the state module**

Replace `apps/fe/src/lib/section-save-state.ts` with:

```ts
export type SectionSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type SectionSave = {
  status: SectionSaveStatus;
  lastSavedAt: number | null;
  attempts: number;
};

export type SectionSaveAction =
  | { type: "edit" }
  | { type: "saveStart" }
  | { type: "saveOk"; at: number }
  | { type: "saveErr" }
  | { type: "fade" }
  | { type: "reload" };

export function initialSectionSave(): SectionSave {
  return { status: "idle", lastSavedAt: null, attempts: 0 };
}

export function reduceSectionSave(state: SectionSave, action: SectionSaveAction): SectionSave {
  switch (action.type) {
    case "edit":
      return { ...state, status: "dirty" };
    case "saveStart":
      return { ...state, status: "saving" };
    case "saveOk":
      return { status: "saved", lastSavedAt: action.at, attempts: 0 };
    case "saveErr":
      return { ...state, status: "error", attempts: state.attempts + 1 };
    case "fade":
      return { ...state, status: "idle" };
    case "reload":
      return { status: "idle", lastSavedAt: state.lastSavedAt, attempts: 0 };
  }
}
```

- [ ] **Step 2: Update the state tests**

Replace `apps/fe/src/lib/section-save-state.test.ts` with:

```ts
import { describe, expect, test } from "vite-plus/test";
import { reduceSectionSave, initialSectionSave, type SectionSave } from "./section-save-state";

const start = () => initialSectionSave();

describe("reduceSectionSave", () => {
  test("edit moves idle -> dirty", () => {
    expect(reduceSectionSave(start(), { type: "edit" }).status).toBe("dirty");
  });

  test("saveStart moves dirty -> saving", () => {
    const s: SectionSave = { status: "dirty", lastSavedAt: null, attempts: 0 };
    expect(reduceSectionSave(s, { type: "saveStart" }).status).toBe("saving");
  });

  test("saveOk from saving -> saved with savedAt and attempts reset", () => {
    const s: SectionSave = { status: "saving", lastSavedAt: null, attempts: 2 };
    const next = reduceSectionSave(s, { type: "saveOk", at: 1000 });
    expect(next).toEqual({ status: "saved", lastSavedAt: 1000, attempts: 0 });
  });

  test("fade from saved -> idle preserves savedAt", () => {
    const s: SectionSave = { status: "saved", lastSavedAt: 1000, attempts: 0 };
    expect(reduceSectionSave(s, { type: "fade" })).toEqual({
      status: "idle",
      lastSavedAt: 1000,
      attempts: 0,
    });
  });

  test("saveErr from saving -> error and increments attempts", () => {
    const s: SectionSave = { status: "saving", lastSavedAt: null, attempts: 1 };
    expect(reduceSectionSave(s, { type: "saveErr" })).toEqual({
      status: "error",
      lastSavedAt: null,
      attempts: 2,
    });
  });

  test("edit while saving -> dirty (user types during in-flight save)", () => {
    const s: SectionSave = { status: "saving", lastSavedAt: null, attempts: 0 };
    expect(reduceSectionSave(s, { type: "edit" }).status).toBe("dirty");
  });

  test("reload -> idle with preserved savedAt and reset attempts", () => {
    const s: SectionSave = { status: "error", lastSavedAt: 500, attempts: 3 };
    expect(reduceSectionSave(s, { type: "reload" })).toEqual({
      status: "idle",
      lastSavedAt: 500,
      attempts: 0,
    });
  });
});
```

- [ ] **Step 3: Run state tests and confirm they pass**

Run: `cd apps/fe && vp test section-save-state`
Expected: PASS — seven tests green.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/lib/section-save-state.ts apps/fe/src/lib/section-save-state.test.ts
git commit -m "refactor(fe): drop conflict status from section-save state

Adds attempts counter for retry backoff and error-pip gating.
Removes unreachable conflict + networkError naming."
```

---

## Task 4: Frontend — drop `expectedVersion` from the sections mutation layer

**Files:**

- Modify: `apps/fe/src/queries/sections.ts`
- Modify: `apps/fe/src/queries/sections.test.tsx`

- [ ] **Step 1: Make `expectedVersion` optional in the mutation input**

Edit `apps/fe/src/queries/sections.ts`. Change the `UpdateSectionInput` type:

```ts
type UpdateSectionInput = {
  contentJson?: unknown;
  label?: string | null;
  kind?: SectionKind;
  frontmatter?: Record<string, unknown>;
  orderKey?: string;
  expectedVersion?: number;
};
```

No other change — the mutation still forwards `input` directly to the API client.

- [ ] **Step 2: Update the query tests**

Edit `apps/fe/src/queries/sections.test.tsx`. Replace the two `useUpdateSection` tests with:

```ts
describe("useUpdateSection", () => {
  test("patches section in place on success", async () => {
    server.use(
      http.patch("*/sections/:id", () =>
        HttpResponse.json(baseSection({ version: 2, updatedAt: "2026-01-02T00:00:00Z" })),
      ),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "2026-01-01T00:00:00Z" },
      sections: [baseSection()],
    });
    const { result } = renderHook(() => useUpdateSection({ sectionId: "s1", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ contentJson: { type: "doc" } });
    });
    const cached = qc.getQueryData<{ sections: Array<{ version: number }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(cached?.sections[0]?.version).toBe(2);
  });

  test("does not include expectedVersion in the request payload by default", async () => {
    let captured: unknown = null;
    server.use(
      http.patch("*/sections/:id", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useUpdateSection({ sectionId: "s1", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ contentJson: { type: "doc" } });
    });
    expect(captured).toEqual({ contentJson: { type: "doc" } });
  });
});
```

Also remove the now-unused `ApiError` import from the top of the file (leave it if other tests still use it — grep first).

- [ ] **Step 3: Run the tests and confirm they pass**

Run: `cd apps/fe && vp test queries/sections`
Expected: PASS — both new cases plus the untouched create/delete cases.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/queries/sections.ts apps/fe/src/queries/sections.test.tsx
git commit -m "refactor(fe): make expectedVersion optional in useUpdateSection

Drops the 409 test — conflict paths are sidelined by the new save
pipeline (see spec: 2026-04-24-seamless-offline-save-design)."
```

---

## Task 5: Frontend — implement `useSectionSave` hook

**Files:**

- Create: `apps/fe/src/lib/use-section-save.ts`
- Create: `apps/fe/src/lib/use-section-save.test.tsx`

This is the largest task. It proceeds in three sub-phases (5A, 5B, 5C), each with its own commit, so review is incremental.

### 5A — Scaffold + initialContent recovery

- [ ] **Step 1: Write failing test for initialContent resolution**

Create `apps/fe/src/lib/use-section-save.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { useSectionSave } from "./use-section-save";
import { putLocalSnapshot, clearLocalSnapshot } from "./section-save-store";
import type { Section } from "#/lib/api-types";

const serverDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "server" }] }],
};
const localDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "local" }] }],
};

const baseSection = (patch: Partial<Section> = {}): Section =>
  ({
    id: "s1",
    documentId: "d1",
    orderKey: "a0",
    label: null,
    kind: "prose",
    contentJson: serverDoc,
    contentText: "server",
    contentHash: "",
    frontmatter: {},
    version: 1,
    createdBy: "u",
    updatedBy: "u",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...patch,
  }) as Section;

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe("useSectionSave — initialContent", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    clearLocalSnapshot("s1");
  });

  test("uses server content when no local snapshot exists", () => {
    const Wrapper = wrap();
    const { result } = renderHook(
      () => useSectionSave({ section: baseSection(), documentId: "d1", editor: null }),
      { wrapper: Wrapper },
    );
    expect(result.current.initialContent).toEqual(serverDoc);
  });

  test("uses local snapshot when savedAt > server updatedAt", () => {
    putLocalSnapshot("s1", { contentJson: localDoc, savedAt: Date.UTC(2026, 0, 2) });
    const Wrapper = wrap();
    const { result } = renderHook(
      () =>
        useSectionSave({
          section: baseSection({ updatedAt: "2026-01-01T00:00:00Z" }),
          documentId: "d1",
          editor: null,
        }),
      { wrapper: Wrapper },
    );
    expect(result.current.initialContent).toEqual(localDoc);
    expect(result.current.state.status).toBe("dirty");
  });

  test("discards stale local snapshot and uses server content", () => {
    putLocalSnapshot("s1", { contentJson: localDoc, savedAt: Date.UTC(2025, 11, 31) });
    const Wrapper = wrap();
    const { result } = renderHook(
      () =>
        useSectionSave({
          section: baseSection({ updatedAt: "2026-01-01T00:00:00Z" }),
          documentId: "d1",
          editor: null,
        }),
      { wrapper: Wrapper },
    );
    expect(result.current.initialContent).toEqual(serverDoc);
    expect(window.localStorage.getItem("patram:section:s1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `cd apps/fe && vp test use-section-save`
Expected: FAIL — `useSectionSave` does not exist.

- [ ] **Step 3: Implement the hook scaffold**

Create `apps/fe/src/lib/use-section-save.ts`:

```ts
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { useUpdateSection } from "#/queries/sections";
import { ApiError } from "#/lib/api-error";
import { clearLocalSnapshot, getLocalSnapshot, putLocalSnapshot } from "#/lib/section-save-store";
import { initialSectionSave, reduceSectionSave, type SectionSave } from "#/lib/section-save-state";

const IDLE_DEBOUNCE_MS = 2000;
const SAVED_FADE_MS = 1500;
const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const ERROR_SURFACE_THRESHOLD = 3;

type UseSectionSaveArgs = {
  section: Section;
  documentId: string;
  editor: TEditor | null;
};

type UseSectionSaveResult = {
  state: SectionSave;
  flushNow: () => Promise<void>;
  initialContent: JSONContent;
};

function resolveInitialContent(section: Section): {
  content: JSONContent;
  seededFromLocal: boolean;
} {
  const snap = getLocalSnapshot(section.id);
  const serverMs = new Date(section.updatedAt).getTime();
  if (!snap) return { content: section.contentJson as JSONContent, seededFromLocal: false };
  if (snap.savedAt > serverMs) {
    return { content: snap.contentJson, seededFromLocal: true };
  }
  clearLocalSnapshot(section.id);
  return { content: section.contentJson as JSONContent, seededFromLocal: false };
}

export function useSectionSave({
  section,
  documentId,
  editor,
}: UseSectionSaveArgs): UseSectionSaveResult {
  const [{ content, seededFromLocal }] = useState(() => resolveInitialContent(section));
  const [state, dispatch] = useReducer(reduceSectionSave, undefined, () =>
    seededFromLocal ? { ...initialSectionSave(), status: "dirty" as const } : initialSectionSave(),
  );

  const update = useUpdateSection({ sectionId: section.id, documentId });
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Placeholder flushNow — filled in by Task 5B.
  const flushNow = useCallback(async () => {
    // intentionally empty at this phase
  }, []);

  return { state, flushNow, initialContent: content };
}
```

- [ ] **Step 4: Run tests, confirm 5A passes**

Run: `cd apps/fe && vp test use-section-save`
Expected: PASS — three initialContent tests green.

- [ ] **Step 5: Commit 5A**

```bash
git add apps/fe/src/lib/use-section-save.ts apps/fe/src/lib/use-section-save.test.tsx
git commit -m "feat(fe): scaffold useSectionSave with localStorage recovery

Resolves initialContent from server or a fresher local snapshot.
Seeds the reducer into dirty state when we recovered local edits."
```

### 5B — Debounced save, blur flush, in-flight serialization, retry

- [ ] **Step 1: Add failing tests for save triggers**

Append to `apps/fe/src/lib/use-section-save.test.tsx` (inside the top-level import block, ensure these extra imports are present):

```tsx
import { act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { vi } from "vite-plus/test";
import { server } from "#/test/server";
```

Then append, below the existing `describe("useSectionSave — initialContent", ...)` block:

```tsx
type StubEditor = {
  getJSON: () => JSONContent;
  on: (name: string, cb: () => void) => void;
  off: (name: string, cb: () => void) => void;
  __fire: (name: string) => void;
};

function makeStubEditor(initial: JSONContent): StubEditor {
  let current = initial;
  const listeners: Record<string, Set<() => void>> = {};
  return {
    getJSON: () => current,
    on: (name, cb) => {
      (listeners[name] ??= new Set()).add(cb);
    },
    off: (name, cb) => {
      listeners[name]?.delete(cb);
    },
    __fire: (name) => {
      listeners[name]?.forEach((cb) => cb());
    },
    // test helper to mutate "document"
    // @ts-expect-error - attaching for tests only
    __setJSON: (j: JSONContent) => {
      current = j;
    },
  };
}

describe("useSectionSave — save triggers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  test("debounces a save 2s after the last edit", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", async () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    // simulate a keystroke: onUpdate fires from Tiptap
    act(() => {
      ed.__fire("update");
    });
    expect(calls).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(calls).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(2);
      await vi.runOnlyPendingTimersAsync();
    });
    expect(calls).toBe(1);
    expect(result.current.state.status).toBe("saved");
  });

  test("flushNow short-circuits the debounce", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", async () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    act(() => {
      ed.__fire("update");
    });
    await act(async () => {
      await result.current.flushNow();
    });
    expect(calls).toBe(1);
  });

  test("blur triggers an immediate flush", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", async () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: 2 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    act(() => {
      ed.__fire("update");
    });
    await act(async () => {
      ed.__fire("blur");
      await vi.runOnlyPendingTimersAsync();
    });
    expect(calls).toBe(1);
  });

  test("serializes concurrent saves — one follow-up, not N", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", async () => {
        calls += 1;
        return HttpResponse.json(baseSection({ version: calls + 1 }));
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    await act(async () => {
      const p1 = result.current.flushNow();
      const p2 = result.current.flushNow();
      const p3 = result.current.flushNow();
      await Promise.all([p1, p2, p3]);
      await vi.runOnlyPendingTimersAsync();
    });
    // First call: one flight; the other two collapse to a single queued resave.
    expect(calls).toBe(2);
  });

  test("clears localStorage snapshot on successful save", async () => {
    server.use(http.patch("*/sections/:id", () => HttpResponse.json(baseSection({ version: 2 }))));
    putLocalSnapshot("s1", { contentJson: localDoc, savedAt: Date.UTC(2026, 0, 2) });
    const Wrapper = wrap();
    const ed = makeStubEditor(localDoc);
    const { rerender, result } = renderHook(
      ({ editor }) =>
        useSectionSave({
          section: baseSection({ updatedAt: "2026-01-01T00:00:00Z" }),
          documentId: "d1",
          editor,
        }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    await act(async () => {
      await result.current.flushNow();
    });
    expect(window.localStorage.getItem("patram:section:s1")).toBeNull();
  });

  test("retries on network failure with exponential backoff, silent for first 2 attempts", async () => {
    let calls = 0;
    server.use(
      http.patch("*/sections/:id", () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    const Wrapper = wrap();
    const ed = makeStubEditor(serverDoc);
    const { rerender, result } = renderHook(
      ({ editor }) => useSectionSave({ section: baseSection(), documentId: "d1", editor }),
      { wrapper: Wrapper, initialProps: { editor: null as unknown as TEditor | null } },
    );
    rerender({ editor: ed as unknown as TEditor });
    await act(async () => {
      await result.current.flushNow();
    });
    expect(calls).toBe(1);
    expect(result.current.state.status).toBe("dirty"); // below threshold
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();
    });
    expect(calls).toBe(2);
    expect(result.current.state.status).toBe("dirty");
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await vi.runOnlyPendingTimersAsync();
    });
    expect(calls).toBe(3);
    expect(result.current.state.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run the new tests, confirm they fail**

Run: `cd apps/fe && vp test use-section-save`
Expected: FAIL — hook lacks debounce, flushNow, retry.

- [ ] **Step 3: Implement the full save pipeline**

Replace the body of `apps/fe/src/lib/use-section-save.ts` (keeping the imports and helpers from 5A) with:

```ts
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { useUpdateSection } from "#/queries/sections";
import { ApiError } from "#/lib/api-error";
import { clearLocalSnapshot, getLocalSnapshot, putLocalSnapshot } from "#/lib/section-save-store";
import { initialSectionSave, reduceSectionSave, type SectionSave } from "#/lib/section-save-state";

const IDLE_DEBOUNCE_MS = 2000;
const SAVED_FADE_MS = 1500;
const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const ERROR_SURFACE_THRESHOLD = 3;

type UseSectionSaveArgs = {
  section: Section;
  documentId: string;
  editor: TEditor | null;
};

type UseSectionSaveResult = {
  state: SectionSave;
  flushNow: () => Promise<void>;
  initialContent: JSONContent;
};

function resolveInitialContent(section: Section): {
  content: JSONContent;
  seededFromLocal: boolean;
} {
  const snap = getLocalSnapshot(section.id);
  const serverMs = new Date(section.updatedAt).getTime();
  if (!snap) return { content: section.contentJson as JSONContent, seededFromLocal: false };
  if (snap.savedAt > serverMs) {
    return { content: snap.contentJson, seededFromLocal: true };
  }
  clearLocalSnapshot(section.id);
  return { content: section.contentJson as JSONContent, seededFromLocal: false };
}

export function useSectionSave({
  section,
  documentId,
  editor,
}: UseSectionSaveArgs): UseSectionSaveResult {
  const [{ content, seededFromLocal }] = useState(() => resolveInitialContent(section));
  const [state, dispatch] = useReducer(reduceSectionSave, undefined, () =>
    seededFromLocal ? { ...initialSectionSave(), status: "dirty" as const } : initialSectionSave(),
  );

  const update = useUpdateSection({ sectionId: section.id, documentId });
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const mountedRef = useRef(true);
  const saveInFlightRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const attemptsRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const editorRef = useRef<TEditor | null>(editor);
  const flushNowRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      // Final fire-and-forget flush from the localStorage snapshot, if any.
      // Using the snapshot (not editor.getJSON()) because the editor may
      // already be torn down. localStorage still has the snapshot, so even
      // if this mutation fails the next mount will recover.
      const snap = getLocalSnapshot(section.id);
      if (snap) {
        void updateRef.current.mutateAsync({ contentJson: snap.contentJson }).catch(() => {
          // best-effort
        });
      }
    },
    [section.id],
  );

  const flushNow = useCallback(async (): Promise<void> => {
    const ed = editorRef.current;
    if (!ed) return;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (saveInFlightRef.current) {
      pendingResaveRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    const json = ed.getJSON();
    dispatch({ type: "saveStart" });
    try {
      await update.mutateAsync({ contentJson: json });
      if (!mountedRef.current) return;
      attemptsRef.current = 0;
      clearLocalSnapshot(section.id);
      dispatch({ type: "saveOk", at: Date.now() });
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) dispatch({ type: "fade" });
      }, SAVED_FADE_MS);
    } catch (err) {
      if (!mountedRef.current) return;
      attemptsRef.current += 1;
      const isHard4xx =
        err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429;
      if (isHard4xx) {
        dispatch({ type: "saveErr" });
        // No auto-retry for hard 4xx; user-triggered retry via pip.
      } else {
        if (attemptsRef.current >= ERROR_SURFACE_THRESHOLD) {
          dispatch({ type: "saveErr" });
        } else {
          dispatch({ type: "edit" }); // stay "dirty" under the threshold
        }
        const idx = Math.min(attemptsRef.current - 1, RETRY_BACKOFF_MS.length - 1);
        const delay = RETRY_BACKOFF_MS[idx]!;
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          if (mountedRef.current) void flushNowRef.current();
        }, delay);
      }
    } finally {
      saveInFlightRef.current = false;
      if (pendingResaveRef.current && mountedRef.current) {
        pendingResaveRef.current = false;
        // Schedule on next tick so the current microtask unwinds cleanly.
        window.setTimeout(() => void flushNowRef.current(), 0);
      }
    }
  }, [section.id, update]);

  useEffect(() => {
    flushNowRef.current = flushNow;
  }, [flushNow]);

  // Register editor listeners once an editor is available.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      const json = editor.getJSON();
      putLocalSnapshot(section.id, { contentJson: json, savedAt: Date.now() });
      dispatch({ type: "edit" });
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        void flushNowRef.current();
      }, IDLE_DEBOUNCE_MS);
    };
    const onBlur = () => {
      void flushNowRef.current();
    };
    editor.on("update", onUpdate);
    editor.on("blur", onBlur);
    return () => {
      editor.off("update", onUpdate);
      editor.off("blur", onBlur);
    };
  }, [editor, section.id]);

  // If we seeded from local, flush the recovered content once the editor is ready.
  useEffect(() => {
    if (!seededFromLocal || !editor) return;
    void flushNowRef.current();
    // Only run once per (seededFromLocal, first editor) combination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, seededFromLocal]);

  return { state, flushNow, initialContent: content };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `cd apps/fe && vp test use-section-save`
Expected: PASS — all 5A + 5B tests green.

- [ ] **Step 5: Commit 5B**

```bash
git add apps/fe/src/lib/use-section-save.ts apps/fe/src/lib/use-section-save.test.tsx
git commit -m "feat(fe): useSectionSave debounce + blur flush + retry

Idle-debounced save, blur → flushNow, in-flight serialization with
single queued resave, exponential backoff on network/5xx errors
(silent for 2 attempts, surfaces on the 3rd and keeps retrying)."
```

### 5C — beforeunload sendBeacon

- [ ] **Step 1: Add failing test for beforeunload**

Append to the same test file, at the bottom:

```tsx
describe("useSectionSave — beforeunload", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  test("sends a beacon when unloading with a dirty snapshot", () => {
    const beacons: Array<{ url: string; body: string }> = [];
    const original = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, data: Blob) => {
        void data.text().then((body) => beacons.push({ url, body }));
        return true;
      },
    });

    putLocalSnapshot("s1", { contentJson: localDoc, savedAt: Date.UTC(2026, 0, 2) });
    const Wrapper = wrap();
    renderHook(
      () =>
        useSectionSave({
          section: baseSection({ updatedAt: "2026-01-01T00:00:00Z" }),
          documentId: "d1",
          editor: null,
        }),
      { wrapper: Wrapper },
    );
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(beacons).toHaveLength(1);
    expect(beacons[0]!.url).toContain("/sections/s1");

    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: original });
  });

  test("no-ops when there is no local snapshot", () => {
    let called = 0;
    const original = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: () => {
        called += 1;
        return true;
      },
    });
    const Wrapper = wrap();
    renderHook(() => useSectionSave({ section: baseSection(), documentId: "d1", editor: null }), {
      wrapper: Wrapper,
    });
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(called).toBe(0);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: original });
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `cd apps/fe && vp test use-section-save`
Expected: FAIL — no beforeunload listener wired yet.

- [ ] **Step 3: Add the beacon effect**

Append a new `useEffect` inside the hook body, immediately after the editor-listener effect:

```ts
// Fire-and-forget beacon on tab close / reload so unsaved edits still land.
useEffect(() => {
  const handler = () => {
    const snap = getLocalSnapshot(section.id);
    if (!snap) return;
    const url = `/api/sections/${section.id}`;
    const blob = new Blob([JSON.stringify({ contentJson: snap.contentJson })], {
      type: "application/json",
    });
    try {
      navigator.sendBeacon(url, blob);
    } catch {
      // best-effort
    }
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [section.id]);
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd apps/fe && vp test use-section-save`
Expected: PASS — all tests green (5A + 5B + 5C).

- [ ] **Step 5: Commit 5C**

```bash
git add apps/fe/src/lib/use-section-save.ts apps/fe/src/lib/use-section-save.test.tsx
git commit -m "feat(fe): beforeunload sendBeacon for unsaved section edits

Tab-close safety net: if a local snapshot exists, fire a beacon
PATCH to /api/sections/:id. Next mount recovers from localStorage
if the beacon didn't land."
```

---

## Task 6: Frontend — refactor `section-block.tsx` onto the hook

**Files:**

- Modify: `apps/fe/src/components/doc/section-block.tsx`
- Modify: `apps/fe/src/components/doc/section-block.test.tsx`

- [ ] **Step 1: Add failing tests for the two mount-recovery cases**

Replace `apps/fe/src/components/doc/section-block.test.tsx` with:

```tsx
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { server } from "#/test/server";
import { SectionBlock } from "./section-block";
import { putLocalSnapshot } from "#/lib/section-save-store";
import type { Section } from "#/lib/api-types";

const section: Section = {
  id: "s1",
  documentId: "d1",
  orderKey: "a0",
  label: null,
  kind: "prose",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "server" }] }],
  },
  contentText: "",
  contentHash: "",
  frontmatter: {},
  version: 1,
  createdBy: "u",
  updatedBy: "u",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function renderBlock() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SectionBlock
        section={section}
        documentId="d1"
        isOnlySection={false}
        onRequestAddBelow={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("SectionBlock", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  test("mounts without crashing", () => {
    renderBlock();
  });

  test("seeds editor from fresher local snapshot and flushes to server", async () => {
    let patchBody: unknown = null;
    server.use(
      http.patch("*/sections/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ...section, version: 2 });
      }),
    );
    putLocalSnapshot("s1", {
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "local" }] }],
      },
      savedAt: Date.UTC(2026, 0, 2),
    });
    const { container } = renderBlock();
    await waitFor(() => expect(container.textContent).toContain("local"));
    await waitFor(() =>
      expect(patchBody).toEqual({
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "local" }] }],
        },
      }),
    );
  });

  test("discards stale local snapshot", async () => {
    putLocalSnapshot("s1", {
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "stale" }] }],
      },
      savedAt: Date.UTC(2025, 11, 31),
    });
    const { container } = renderBlock();
    await waitFor(() => expect(container.textContent).toContain("server"));
    expect(window.localStorage.getItem("patram:section:s1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `cd apps/fe && vp test section-block`
Expected: FAIL — current `SectionBlock` does not read localStorage at mount.

- [ ] **Step 3: Rewrite `section-block.tsx` around the hook**

Replace `apps/fe/src/components/doc/section-block.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { Editor } from "#/components/editor/editor";
import { SectionToolbar } from "./section-toolbar";
import { useSectionSave } from "#/lib/use-section-save";
import { useDeleteSection } from "#/queries/sections";
import { useUi } from "#/stores/ui";

export function SectionBlock({
  section,
  documentId,
  isOnlySection,
  onRequestAddBelow,
  onEditorReady,
  onFocusPrev,
  onFocusNext,
}: {
  section: Section;
  documentId: string;
  isOnlySection: boolean;
  onRequestAddBelow: () => void;
  onEditorReady?: (id: string, editor: TEditor) => void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
}) {
  const [editor, setEditor] = useState<TEditor | null>(null);
  const { state, flushNow, initialContent } = useSectionSave({
    section,
    documentId,
    editor,
  });
  const del = useDeleteSection({ sectionId: section.id, documentId });
  const setSaveState = useUi((s) => s.setSectionSaveState);
  const clearSaveState = useUi((s) => s.clearSectionSaveState);

  const onRequestAddBelowRef = useRef(onRequestAddBelow);
  const onFocusPrevRef = useRef(onFocusPrev);
  const onFocusNextRef = useRef(onFocusNext);
  useEffect(() => {
    onRequestAddBelowRef.current = onRequestAddBelow;
  }, [onRequestAddBelow]);
  useEffect(() => {
    onFocusPrevRef.current = onFocusPrev;
  }, [onFocusPrev]);
  useEffect(() => {
    onFocusNextRef.current = onFocusNext;
  }, [onFocusNext]);

  useEffect(() => {
    setSaveState(section.id, state);
  }, [state, section.id, setSaveState]);
  useEffect(() => () => clearSaveState(section.id), [section.id, clearSaveState]);

  // Unmount flush — hook owns timers, but we want one last shot at persisting.
  useEffect(() => () => void flushNow(), [flushNow]);

  return (
    <section className="section-block group relative py-3">
      <SectionToolbar
        state={state}
        disabledDelete={isOnlySection}
        onDelete={() => del.mutate()}
        onRetry={() => void flushNow()}
        alwaysVisible={state.status === "saving" || state.status === "error"}
      />
      <Editor
        sectionId={section.id}
        initialContent={initialContent as JSONContent}
        onReady={(ed) => {
          setEditor(ed);
          onEditorReady?.(section.id, ed);
          ed.view.dom.addEventListener("keydown", (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onRequestAddBelowRef.current();
            }
            if (e.key === "ArrowDown") {
              const { selection, doc } = ed.state;
              if (selection.$head.pos >= doc.content.size - 1) {
                e.preventDefault();
                onFocusNextRef.current?.();
              }
            }
            if (e.key === "ArrowUp") {
              const { selection } = ed.state;
              if (selection.$head.pos <= 1) {
                e.preventDefault();
                onFocusPrevRef.current?.();
              }
            }
          });
        }}
      />
    </section>
  );
}
```

(No `onChange` prop needed — the hook listens directly to the editor via `editor.on("update", ...)`.)

- [ ] **Step 4: Verify `Editor` already accepts `initialContent`**

Run: `grep -n "initialContent" apps/fe/src/components/editor/editor.tsx`
Expected: shows `initialContent` as a prop of `EditorProps`. No change needed. If the `onChange` prop is now unused elsewhere, leave it — other callers may exist. Grep to confirm: `grep -rn "Editor.*onChange" apps/fe/src/`.

- [ ] **Step 5: Run tests, confirm they pass**

Run: `cd apps/fe && vp test section-block`
Expected: PASS — three tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/components/doc/section-block.tsx apps/fe/src/components/doc/section-block.test.tsx
git commit -m "refactor(fe): SectionBlock consumes useSectionSave

Lifts editor instance into React state; hook owns all save lifecycle
(debounce, blur, retry, beforeunload, localStorage recovery).
SectionBlock is now a thin adapter."
```

---

## Task 7: Frontend — save-state-pip cleanup + 400ms grace

**Files:**

- Modify: `apps/fe/src/components/doc/save-state-pip.tsx`

- [ ] **Step 1: Rewrite the pip**

Replace `apps/fe/src/components/doc/save-state-pip.tsx` with:

```tsx
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { SectionSave } from "#/lib/section-save-state";

const SAVING_GRACE_MS = 400;

export function SaveStatePip({ state, onRetry }: { state: SectionSave; onRetry?: () => void }) {
  const common = "inline-flex size-3 items-center justify-center rounded-full";
  const [showSaving, setShowSaving] = useState(false);

  useEffect(() => {
    if (state.status !== "saving") {
      setShowSaving(false);
      return;
    }
    const t = window.setTimeout(() => setShowSaving(true), SAVING_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [state.status]);

  switch (state.status) {
    case "idle":
      return <span className={common} aria-live="polite" />;
    case "dirty":
      return <span className={`${common} bg-[#d9a441]`} aria-label="Unsaved changes" />;
    case "saving":
      if (!showSaving) return <span className={common} aria-live="polite" />;
      return <Loader2 className="size-3.5 animate-spin text-(--lagoon-deep)" aria-label="Saving" />;
    case "saved":
      return (
        <span className={`${common} bg-(--lagoon) text-white`} aria-label="Saved">
          <Check className="size-2" />
        </span>
      );
    case "error":
      return (
        <button
          onClick={onRetry}
          className={`${common} bg-red-600`}
          aria-label="Save failed, click to retry"
        />
      );
  }
}
```

- [ ] **Step 2: Run the app-wide test suite to catch any type breakage**

Run: `cd apps/fe && vp test`
Expected: PASS — all FE tests green.

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/doc/save-state-pip.tsx
git commit -m "refactor(fe): drop conflict pip, add 400ms saving grace

Quick saves (<400ms) no longer flash a spinner — the indicator
waits one grace period before rendering the 'saving' state, so
short local-network saves feel instant."
```

---

## Task 8: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full toolchain**

Run in the repo root:

```bash
vp check
vp test
vp build
```

Expected:

- `vp check` — no type or format errors **other than** the pre-existing `apps/fe/src/routeTree.gen.ts` formatting noise (this is auto-generated and already noted in `git status` on this branch).
- `vp test` — all suites green. FE count should be ≥ 46 (previous 40 + ~6 new from store + hook + block).
- `vp build` — BE and FE build without errors.

- [ ] **Step 2: Manual smoke test**

Start BE and FE and exercise the editor:

```bash
# terminal 1
cd apps/be && vp dev
# terminal 2
cd apps/fe && vp dev
```

Then verify:

1. Type in a section for 10s without pauses; confirm no pip flashes during short pauses.
2. Stop typing; after ~2s a very brief save indicator appears then fades, or stays invisible if the save was under 400ms.
3. Block network in DevTools → type edits → reload page. On mount, the section restores the local edits (look for them visibly, confirm `patram:section:<id>` was present pre-reload, cleared after the first successful flush).
4. DevTools Application tab → Local Storage: confirm `patram:section:<id>` appears while typing and disappears after a successful save.
5. Open two sections, click into the first, type, click into the second — confirm the first flushes on blur (pip flicks briefly if the save took >400ms).
6. Confirm no version-conflict UI ever appears. No 409s in the network tab on normal edits.

- [ ] **Step 3: Commit anything incidental + wrap up**

If Task 8 surfaced small issues (e.g. an import missed in Task 4), fix them in-place and commit. Otherwise, this task ends without a commit.

---

## Notes

- The existing editor `onChange` prop stays in place to avoid churn for any other callers (none currently, but the surface stays stable).
- `useUi`'s `setSectionSaveState` still accepts `SectionSave`; the shape change (added `attempts`) is backwards-compatible for any consumer reading `.status` only. Worth a grep (`grep -rn "sectionSaveState\|setSectionSaveState" apps/fe/src/`) during Task 6 to confirm no consumer pattern-matches on the old `conflict` status.
- The hook intentionally does not send `expectedVersion`. If a future feature wants optimistic locking back, it can be opt-in at the call site of `useUpdateSection`.
