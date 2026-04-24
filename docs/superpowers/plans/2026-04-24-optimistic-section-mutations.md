# Optimistic Section Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `add section` and `delete section` React Query mutations update the cache synchronously, with the FE generating section UUIDs so the new section auto-focuses without a server round-trip.

**Architecture:** Client generates `crypto.randomUUID()` for new sections; BE's `createSection` service and `POST /documents/:id/sections` route accept an optional client-supplied `id`. On the FE, `useCreateSection` and `useDeleteSection` gain `onMutate` / `onError` / `onSuccess` handlers that patch the document detail cache (`qk.document(docId)`) synchronously and roll back to a pre-mutation snapshot on failure. `SectionList` generates the id, drops its `isPending` gate, and auto-focuses the newly-created section via the existing `onEditorReady` callback.

**Tech Stack:** React 19, TanStack Query v5, Hono + zod on BE, Drizzle (Postgres), Tiptap, Vitest via `vite-plus/test`, MSW for FE query tests.

**Spec:** `docs/superpowers/specs/2026-04-24-optimistic-section-mutations-design.md`

**Note on spec vs. plan — `documents.ts`:** The spec listed `apps/be/src/routes/documents.ts` as a file to modify. On inspection, `POST /documents` creates a document and its initial section in one transaction; the initial section is server-internal and no client id is ever threaded in. This plan does **not** touch `documents.ts`; only `section-write.ts` (type) and `sections.ts` (route) get the `id` passthrough.

---

## Task 1: BE service — accept optional client-supplied `id` on `createSection`

**Files:**

- Modify: `apps/be/src/services/section-write.ts` (`CreateSectionInput` type + `createSection` function)

- [ ] **Step 1: Widen `CreateSectionInput`**

Edit `apps/be/src/services/section-write.ts`:

```ts
export type CreateSectionInput = {
  id?: string;
  documentId: string;
  userId: string;
  orderKey: string;
  contentJson: unknown;
  label?: string | null;
  kind?: SectionKind;
  frontmatter?: Record<string, unknown>;
};
```

- [ ] **Step 2: Pass `id` through to the insert**

In `createSection`, inside the `tx.insert(sections).values({ ... })` block, add `id` as the first field, using the spread-when-present pattern so the column default (server-generated uuid) still applies when the caller omits it:

```ts
const [inserted] = await tx
  .insert(sections)
  .values({
    ...(input.id ? { id: input.id } : {}),
    documentId: input.documentId,
    orderKey: input.orderKey,
    label: input.label ?? null,
    kind: input.kind ?? "prose",
    contentJson: derived.canonicalJson,
    contentText: derived.contentText,
    contentHash: derived.contentHash,
    frontmatter: input.frontmatter ?? {},
    version: 1,
    createdBy: input.userId,
    updatedBy: input.userId,
  })
  .returning();
```

- [ ] **Step 3: Commit**

```bash
git add apps/be/src/services/section-write.ts
git commit -m "feat(be): createSection accepts optional client-supplied id"
```

---

## Task 2: BE route — expose `id` on `POST /documents/:docId/sections` + tests

**Files:**

- Modify: `apps/be/src/routes/sections.ts` (`createBody` schema + handler)
- Modify: `apps/be/src/routes/sections.test.ts` (three new tests)

- [ ] **Step 1: Write the failing tests**

Append to `apps/be/src/routes/sections.test.ts`:

```ts
it("POST persists a client-supplied id", async () => {
  const id = crypto.randomUUID();
  const res = await app.request(`/documents/${docId}/sections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  expect(body.id).toBe(id);
});

it("POST without id still generates one server-side", async () => {
  const res = await app.request(`/documents/${docId}/sections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

it("POST with a non-uuid id returns 400", async () => {
  const res = await app.request(`/documents/${docId}/sections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "not-a-uuid" }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run the new tests — expect them to fail**

```bash
vp test apps/be/src/routes/sections.test.ts -t "client-supplied id"
vp test apps/be/src/routes/sections.test.ts -t "without id still"
vp test apps/be/src/routes/sections.test.ts -t "non-uuid id"
```

Expected: all three fail (the route doesn't yet accept or validate `id`).

- [ ] **Step 3: Extend `createBody` and the handler**

Edit `apps/be/src/routes/sections.ts`:

```ts
const createBody = z.object({
  id: z.string().uuid().optional(),
  orderKey: z.string().optional(),
  kind: z.enum(["prose", "list", "table", "code", "callout", "embed"]).optional(),
  contentJson: z.unknown().optional(),
  label: z.string().nullable().optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
});
```

In the handler, forward `id`:

```ts
const section = await createSection(db as unknown as PgDatabase<any, any, any> as any, {
  id: body.id,
  documentId: docId,
  userId,
  orderKey,
  contentJson: body.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
  label: body.label ?? null,
  kind: body.kind,
  frontmatter: body.frontmatter,
});
```

- [ ] **Step 4: Run the new tests — expect pass**

```bash
vp test apps/be/src/routes/sections.test.ts
```

Expected: all sections tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/be/src/routes/sections.ts apps/be/src/routes/sections.test.ts
git commit -m "feat(be): accept client-supplied uuid on POST /sections"
```

---

## Task 3: FE — optimistic `useDeleteSection`

**Files:**

- Modify: `apps/fe/src/queries/sections.ts` (`useDeleteSection`)
- Modify: `apps/fe/src/queries/sections.test.tsx` (new cases)

- [ ] **Step 1: Write the failing optimistic + rollback tests**

Replace the existing `describe("useDeleteSection", ...)` block in `apps/fe/src/queries/sections.test.tsx`:

```tsx
describe("useDeleteSection", () => {
  test("removes the section synchronously (optimistic) and keeps it removed on success", async () => {
    server.use(
      http.delete("*/sections/:id", async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json({ ok: true });
      }),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection(), baseSection({ id: "s2" })],
    });
    const { result } = renderHook(() => useDeleteSection({ sectionId: "s2", documentId: "d1" }), {
      wrapper: Wrapper,
    });

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.mutateAsync();
    });
    // Synchronous: already gone from cache.
    const mid = qc.getQueryData<{ sections: Array<{ id: string }> }>(["documents", "detail", "d1"]);
    expect(mid?.sections.map((s) => s.id)).toEqual(["s1"]);

    await act(async () => {
      await promise;
    });
    const after = qc.getQueryData<{ sections: Array<{ id: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1"]);
  });

  test("restores the section when the server errors", async () => {
    server.use(http.delete("*/sections/:id", () => HttpResponse.json({}, { status: 500 })));
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection(), baseSection({ id: "s2" })],
    });
    const { result } = renderHook(() => useDeleteSection({ sectionId: "s2", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });
    const after = qc.getQueryData<{ sections: Array<{ id: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});
```

- [ ] **Step 2: Run the tests — expect fail**

```bash
vp test apps/fe/src/queries/sections.test.tsx -t "useDeleteSection"
```

Expected: the synchronous-optimistic test fails (today the removal only happens after `await`), and the rollback test fails (today errors don't restore).

- [ ] **Step 3: Rewrite `useDeleteSection` to be optimistic**

Replace the `useDeleteSection` export in `apps/fe/src/queries/sections.ts`:

```ts
export function useDeleteSection(args: { sectionId: string; documentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap<{ ok: true }>(await api.sections[":id"].$delete({ param: { id: args.sectionId } })),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: qk.document(args.documentId) });
      const previous = qc.getQueryData<DocDetail>(qk.document(args.documentId));
      qc.setQueryData<DocDetail>(qk.document(args.documentId), (prev) => {
        if (!prev) return prev;
        return { ...prev, sections: prev.sections.filter((s) => s.id !== args.sectionId) };
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.document(args.documentId), ctx.previous);
      console.error("useDeleteSection failed", err);
    },
  });
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
vp test apps/fe/src/queries/sections.test.tsx -t "useDeleteSection"
```

Expected: both cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/queries/sections.ts apps/fe/src/queries/sections.test.tsx
git commit -m "feat(fe): optimistic useDeleteSection with rollback"
```

---

## Task 4: FE — optimistic `useCreateSection` with client-generated id

**Files:**

- Modify: `apps/fe/src/queries/sections.ts` (`useCreateSection` signature + handlers)
- Modify: `apps/fe/src/queries/sections.test.tsx` (new cases)

- [ ] **Step 1: Update the `CreateSectionInput` type and helper**

In `apps/fe/src/queries/sections.ts` modify the input type and import `qk.me`-adjacent types:

```ts
import type { MeResponse } from "#/queries/me";

type CreateSectionInput = {
  id: string;
  orderKey: string;
  kind?: SectionKind;
  contentJson?: unknown;
  label?: string | null;
  frontmatter?: Record<string, unknown>;
};
```

Note: `id` and `orderKey` are now **required** on the FE hook input (the hook is the one contract-owner for that). The BE still treats `id` as optional; other BE callers (e.g., the bootstrap section from `POST /documents`) omit it.

- [ ] **Step 2: Write the failing optimistic + rollback tests**

Replace the existing `describe("useCreateSection", ...)` block in `apps/fe/src/queries/sections.test.tsx`:

```tsx
describe("useCreateSection", () => {
  test("inserts an optimistic row with the client id and swaps with server result on success", async () => {
    server.use(
      http.post("*/documents/:docId/sections", async ({ request }) => {
        await new Promise((r) => setTimeout(r, 30));
        const body = (await request.json()) as { id: string; orderKey: string };
        return HttpResponse.json(
          baseSection({
            id: body.id,
            orderKey: body.orderKey,
            contentHash: "server-hash",
            contentText: "",
            version: 1,
          }),
          { status: 201 },
        );
      }),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["me"], {
      user: { id: "u1", email: "x", name: "x" },
      workspace: { id: "w1", name: "", slug: "", createdAt: "", updatedAt: "" },
      role: "owner",
    });
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection()],
    });
    const { result } = renderHook(() => useCreateSection("d1"), { wrapper: Wrapper });

    const clientId = "11111111-1111-4111-8111-111111111111";
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.mutateAsync({ id: clientId, orderKey: "a1" });
    });
    // Synchronous: optimistic row is already there with the client id.
    const mid = qc.getQueryData<{ sections: Array<{ id: string; contentHash: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(mid?.sections.map((s) => s.id)).toEqual(["s1", clientId]);
    expect(mid?.sections[1]?.contentHash).toBe("");

    await act(async () => {
      await promise;
    });
    const after = qc.getQueryData<{ sections: Array<{ id: string; contentHash: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1", clientId]);
    expect(after?.sections[1]?.contentHash).toBe("server-hash");
  });

  test("rolls back the optimistic insert when the server errors", async () => {
    server.use(
      http.post("*/documents/:docId/sections", () => HttpResponse.json({}, { status: 500 })),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection()],
    });
    const { result } = renderHook(() => useCreateSection("d1"), { wrapper: Wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ id: "22222222-2222-4222-8222-222222222222", orderKey: "a1" })
        .catch(() => {});
    });
    const after = qc.getQueryData<{ sections: Array<{ id: string }> }>([
      "documents",
      "detail",
      "d1",
    ]);
    expect(after?.sections.map((s) => s.id)).toEqual(["s1"]);
  });
});
```

- [ ] **Step 3: Run the tests — expect fail**

```bash
vp test apps/fe/src/queries/sections.test.tsx -t "useCreateSection"
```

Expected: both fail (optimistic row not yet synchronous; rollback not implemented).

- [ ] **Step 4: Rewrite `useCreateSection` with optimistic handlers**

Replace `useCreateSection` in `apps/fe/src/queries/sections.ts`:

```ts
export function useCreateSection(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSectionInput) =>
      unwrap<Section>(
        await api.documents[":docId"].sections.$post({
          param: { docId: documentId },
          json: input,
        }),
      ),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.document(documentId) });
      const previous = qc.getQueryData<DocDetail>(qk.document(documentId));
      const me = qc.getQueryData<MeResponse>(qk.me);
      const userId = me?.user.id ?? "";
      const now = new Date().toISOString();
      const optimistic: Section = {
        id: input.id,
        documentId,
        orderKey: input.orderKey,
        label: input.label ?? null,
        kind: input.kind ?? "prose",
        contentJson: input.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
        contentText: "",
        contentHash: "",
        frontmatter: input.frontmatter ?? {},
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<DocDetail>(qk.document(documentId), (prev) => {
        if (!prev) return prev;
        const next = [...prev.sections, optimistic].sort((a, b) =>
          a.orderKey.localeCompare(b.orderKey),
        );
        return { ...prev, sections: next };
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.document(documentId), ctx.previous);
      console.error("useCreateSection failed", err);
    },
    onSuccess: (real) => {
      qc.setQueryData<DocDetail>(qk.document(documentId), (prev) => {
        if (!prev) return prev;
        const swapped = prev.sections.map((s) => (s.id === real.id ? real : s));
        const found = swapped.some((s) => s.id === real.id);
        const next = (found ? swapped : [...swapped, real]).sort((a, b) =>
          a.orderKey.localeCompare(b.orderKey),
        );
        return { ...prev, sections: next };
      });
    },
  });
}
```

- [ ] **Step 5: Run all section query tests — expect pass**

```bash
vp test apps/fe/src/queries/sections.test.tsx
```

Expected: all `useCreateSection`, `useUpdateSection`, `useDeleteSection` tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/queries/sections.ts apps/fe/src/queries/sections.test.tsx
git commit -m "feat(fe): optimistic useCreateSection with client-generated id"
```

---

## Task 5: FE — wire `SectionList` to generate the id and auto-focus the new section

**Files:**

- Modify: `apps/fe/src/components/doc/section-list.tsx`

- [ ] **Step 1: Replace `SectionList` with the focus-tracking version**

Replace the full file at `apps/fe/src/components/doc/section-list.tsx`:

```tsx
import { useRef, useState } from "react";
import type { Editor as TEditor } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { SectionBlock } from "./section-block";
import { AddSectionPill } from "./add-section-pill";
import { useCreateSection } from "#/queries/sections";
import { keyBetween } from "#/lib/order-key";

type EditorsMap = Map<string, TEditor>;

export function SectionList({ documentId, sections }: { documentId: string; sections: Section[] }) {
  const create = useCreateSection(documentId);
  const editors = useRef<EditorsMap>(new Map());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const focusSection = (id: string, where: "start" | "end") => {
    const ed = editors.current.get(id);
    if (!ed) return;
    ed.commands.focus(where);
  };

  const insertAfter = (afterIndex: number) => {
    const cur = sections[afterIndex];
    if (!cur) return;
    const next = sections[afterIndex + 1];
    const orderKey = keyBetween(cur.orderKey, next?.orderKey ?? null);
    const id = crypto.randomUUID();
    setPendingFocusId(id);
    create.mutate({ id, orderKey });
  };

  const handleEditorReady = (id: string, ed: TEditor) => {
    editors.current.set(id, ed);
    if (id === pendingFocusId) {
      ed.commands.focus("start");
      setPendingFocusId(null);
    }
  };

  return (
    <div className="flex flex-col">
      {sections.map((s, i) => (
        <div key={s.id} className="flex flex-col">
          <SectionBlock
            section={s}
            documentId={documentId}
            isOnlySection={sections.length === 1}
            onRequestAddBelow={() => insertAfter(i)}
            onEditorReady={handleEditorReady}
            onFocusPrev={() => {
              const prev = sections[i - 1];
              if (prev) focusSection(prev.id, "end");
            }}
            onFocusNext={() => {
              const nextSec = sections[i + 1];
              if (nextSec) focusSection(nextSec.id, "start");
            }}
          />
          <AddSectionPill onClick={() => insertAfter(i)} />
        </div>
      ))}
    </div>
  );
}
```

Changes from the previous version:

- `useState` import + `pendingFocusId` state.
- `insertAfter` no longer short-circuits on `create.isPending`; it generates `crypto.randomUUID()`, sets `pendingFocusId`, and calls `create.mutate({ id, orderKey })`.
- `handleEditorReady` focuses the editor when it's the pending one and clears the state.

- [ ] **Step 2: Run FE checks**

```bash
vp check --fix
```

Expected: 0 errors. Pre-existing warnings on unrelated test files may remain.

- [ ] **Step 3: Run the broader FE test suite**

```bash
vp test apps/fe
```

Expected: all FE tests pass. (No existing test covers `SectionList`'s focus plumbing, so this is a confidence run.)

- [ ] **Step 4: Manual smoke** (briefly, since no automated test covers the focus)

Start the dev server (`vp run dev` if there's a root dev script, otherwise `vp dev` in `apps/fe`), sign in, open a document, press Ctrl+Enter in the last section, and confirm: a new section appears instantly and the cursor is in it. Click the `+` pill — same behavior. Repeat Ctrl+Enter three times quickly — three distinct new sections should appear in order, with the cursor landing in the last one.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/doc/section-list.tsx
git commit -m "feat(fe): SectionList generates section ids and auto-focuses new sections"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full monorepo checks**

```bash
vp check
vp test
```

Expected: all green (or only pre-existing warnings).

- [ ] **Step 2: Spec-coverage sanity pass**

Re-read `docs/superpowers/specs/2026-04-24-optimistic-section-mutations-design.md`. Walk each checklist item:

- Client generates section id — Task 1 & 2 (BE), Task 5 (FE) ✓
- `useCreateSection` optimistic + rollback — Task 4 ✓
- `useDeleteSection` optimistic + rollback — Task 3 ✓
- `create.isPending` guard removed — Task 5 ✓
- Auto-focus via `pendingFocusId` — Task 5 ✓
- Silent rollback + `console.error` — Tasks 3, 4 ✓
- Tests for optimistic + rollback + BE id — Tasks 2, 3, 4 ✓

If any box is unchecked, add a follow-up task.

---

## Notes

- **Concurrency:** Removing the `isPending` guard is safe because each subsequent `insertAfter` sees the updated document-detail cache (including optimistic rows), so `keyBetween` produces distinct `orderKey`s for back-to-back inserts.
- **PATCH-before-POST risk:** Unchanged from spec. `useSectionSave`'s `IDLE_DEBOUNCE_MS` is 2000 ms — well above typical POST RTT — so a PATCH for a just-created section almost always fires after the POST has completed. No gating is added speculatively.
- **`crypto.randomUUID()`:** Available in all target browsers for the FE and in Node 20+ for test runs; the BE test at Task 2 uses it directly, which works under Vite+'s Node environment.
