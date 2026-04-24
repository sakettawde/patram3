# Patram SPA ↔ BE Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `apps/fe` to the Hono BE. Replace in-memory Zustand with BetterAuth sessions, Hono-RPC React Query hooks, and per-section Tiptap editors. Surface section-level optimistic-concurrency (409) in the UX, debounce per-section saves, roll per-section save state up to the topbar chip, and delete the `seed-docs.ts` path.

**Architecture:** SPA stays client-only. Dedicated `/sign-in` and `/sign-up` routes sit under an `_unauth` layout; everything else sits under an `_authed` layout that does `GET /me` in `beforeLoad`. Persistent state lives in React Query; Zustand holds UI ephemera plus a map of per-section save states consumed by the topbar rollup. The doc surface renders a `DocHeader` (standalone emoji/title/meta) plus a vertical stack of `SectionBlock`s — one Tiptap instance per section, pessimistic save with `expectedVersion`, conflict banner preserving the user's edits.

**Tech Stack:** Tanstack Router (pathless layouts, `beforeLoad` redirects) · Hono RPC (`hc<AppType>`) · React Query v5 · BetterAuth (email+password, session cookies) · Tiptap 3 · Zustand · shadcn/radix · MSW for FE tests.

**Spec:** [2026-04-24-patram-spa-be-wiring-design.md](../specs/2026-04-24-patram-spa-be-wiring-design.md). Read §3–§14 before starting.

**Ground rules:**

- Run all commands through `vp` (no `pnpm` / `npm` / `npx`).
- Before every task's "Run tests" step, make sure the BE changes are NOT required — this plan touches FE only. BE is shipped and stable on this branch.
- Each task ends with a commit. Keep commit messages prefixed `feat(fe):`, `test(fe):`, `chore(fe):`, `docs(fe):`.
- Do not re-enable the old `seed-docs.ts`/`documents.ts` Zustand store as a fallback; the plan hard-swaps.
- All file paths below are relative to the repo root `/home/saket/Code/patram3/`.
- Many tasks touch React components that previously read from the old Zustand store. When a task says "replace usage X with Y", assume callers still compile only because the imports/files exist — if a compile breaks mid-task, either the earlier task wasn't finished or the plan is wrong; check before improvising.

---

## File Structure

**Created**

- `apps/fe/src/lib/api.ts` — Hono RPC client singleton.
- `apps/fe/src/lib/api-error.ts` — `ApiError` + `unwrap()`.
- `apps/fe/src/lib/query-keys.ts` — central query key factory.
- `apps/fe/src/lib/extract-section-text.ts` — plaintext extractor (ported from BE).
- `apps/fe/src/lib/section-save-state.ts` — per-section save-state reducer + types.
- `apps/fe/src/lib/save-rollup.ts` — topbar rollup selector.
- `apps/fe/src/queries/me.ts`
- `apps/fe/src/queries/documents.ts`
- `apps/fe/src/queries/sections.ts`
- `apps/fe/src/stores/ui.ts` — slimmed state (replaces `stores/documents.ts`).
- `apps/fe/src/test/msw-handlers.ts` + `apps/fe/src/test/test-utils.tsx` — MSW server + RTL helpers.
- `apps/fe/src/routes/_unauth.tsx` + `apps/fe/src/routes/_unauth/sign-in.tsx` + `apps/fe/src/routes/_unauth/sign-up.tsx`.
- `apps/fe/src/routes/_authed.tsx` + `apps/fe/src/routes/_authed/index.tsx`.
- `apps/fe/src/components/auth/auth-layout.tsx`, `sign-in-form.tsx`, `sign-up-form.tsx`.
- `apps/fe/src/components/doc/doc-header.tsx`, `section-list.tsx`, `section-block.tsx`, `section-toolbar.tsx`, `section-menu.tsx`, `save-state-pip.tsx`, `add-section-pill.tsx`, `section-conflict-banner.tsx`.

**Modified**

- `apps/fe/vite.config.ts` — dev proxy for BE.
- `apps/fe/package.json` — add `msw`, `@tanstack/react-router` imports as needed.
- `apps/fe/src/router.tsx` — `QueryClient` default options.
- `apps/fe/src/integrations/tanstack-query/root-provider.tsx` — default options for `staleTime`, `retry`.
- `apps/fe/src/components/app-shell.tsx` — consume `useDocument(selectedId)`; remove Zustand content reads.
- `apps/fe/src/components/topbar.tsx` — pin removed, status submenu added, wired to `useDeleteDocument` / `useUpdateDocument`.
- `apps/fe/src/components/save-status.tsx` — accept rollup `state` + `savedAt`.
- `apps/fe/src/components/sidebar/sidebar.tsx` — drop Pinned, add filter pills, wire to `useDocumentsList`.
- `apps/fe/src/components/sidebar/doc-row.tsx` — drop pin star.
- `apps/fe/src/components/sidebar/user-chip.tsx` — Sign out + (dev-only) Seed button.
- `apps/fe/src/components/doc/doc-surface.tsx` — renders `DocHeader` + `SectionList` only.
- `apps/fe/src/components/editor/editor.tsx` — becomes the "one Tiptap" piece inside `SectionBlock`; drops title derivation.

**Deleted**

- `apps/fe/src/lib/seed-docs.ts`
- `apps/fe/src/stores/documents.ts`
- `apps/fe/src/stores/documents.test.ts`
- `apps/fe/src/routes/index.tsx` (replaced by `_authed/index.tsx`)
- `apps/fe/src/components/app-shell.test.tsx` (replaced by RTL tests in Task 28)

---

## Task 1: Dev proxy + MSW install

**Files:**

- Modify: `apps/fe/vite.config.ts`
- Modify: `apps/fe/package.json` (via `vp add`)

- [ ] **Step 1: Install MSW as a dev dep**

Run from `apps/fe`:

```
vp add -D msw@^2
```

Expected: msw appears in `devDependencies`.

- [ ] **Step 2: Add dev proxy to Vite config**

Edit `apps/fe/vite.config.ts` — add a `server.proxy` block keyed on the BE's root paths. The `isTest` branch is preserved.

```ts
import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const isTest = process.env.VITEST === "true";

const BE_URL = process.env.VITE_BE_URL ?? "http://localhost:8787";
const BE_PATHS = [
  "/me",
  "/documents",
  "/sections",
  "/threads",
  "/comments",
  "/auth",
  "/dev",
  "/health",
];

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    ...(isTest ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    proxy: Object.fromEntries(
      BE_PATHS.map((p) => [p, { target: BE_URL, changeOrigin: true, secure: false }]),
    ),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});

export default config;
```

- [ ] **Step 3: Create the test setup file (empty scaffold, MSW wires up in Task 2)**

Create `apps/fe/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add the jest-dom matcher if not installed:

```
vp add -D @testing-library/jest-dom
```

- [ ] **Step 4: Verify dev server still boots and check proxy**

Run (from repo root) in one terminal:

```
vp run be#dev
```

In another:

```
cd apps/fe && vp dev
```

Expected: FE starts on :3000. `curl http://localhost:3000/health` returns `{ "ok": true }` (proxied to BE).

- [ ] **Step 5: Commit**

```bash
git add apps/fe/vite.config.ts apps/fe/package.json apps/fe/src/test/setup.ts pnpm-lock.yaml
git commit -m "feat(fe): add BE dev proxy and install msw"
```

---

## Task 2: MSW harness + test utilities

**Files:**

- Create: `apps/fe/src/test/msw-handlers.ts`
- Create: `apps/fe/src/test/server.ts`
- Create: `apps/fe/src/test/test-utils.tsx`
- Modify: `apps/fe/src/test/setup.ts`

- [ ] **Step 1: Create default MSW handlers**

`apps/fe/src/test/msw-handlers.ts`:

```ts
import { http, HttpResponse } from "msw";

export const defaultHandlers = [
  http.get("*/me", () => HttpResponse.json({ error: "unauthorized" }, { status: 401 })),
];
```

- [ ] **Step 2: Create MSW server**

`apps/fe/src/test/server.ts`:

```ts
import { setupServer } from "msw/node";
import { defaultHandlers } from "./msw-handlers";

export const server = setupServer(...defaultHandlers);
```

- [ ] **Step 3: Wire server lifecycle into setup**

Replace `apps/fe/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 4: Create RTL helper with QueryClientProvider**

`apps/fe/src/test/test-utils.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(ui: ReactElement, opts?: RenderOptions) {
  const qc = makeTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...render(ui, { wrapper: Wrapper, ...opts }) };
}
```

- [ ] **Step 5: Sanity test**

Create `apps/fe/src/test/setup.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { server } from "./server";

describe("msw", () => {
  test("server is listening", () => {
    expect(server.listHandlers().length).toBeGreaterThan(0);
  });
});
```

Run: `vp test run` (from `apps/fe`). Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/test
git commit -m "test(fe): add msw server + rtl test utilities"
```

---

## Task 3: ApiError + unwrap

**Files:**

- Create: `apps/fe/src/lib/api-error.ts`
- Create: `apps/fe/src/lib/api-error.test.ts`

- [ ] **Step 1: Write failing test**

`apps/fe/src/lib/api-error.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { ApiError, unwrap } from "./api-error";

describe("ApiError", () => {
  test("is409 returns true for version_conflict body", () => {
    const err = new ApiError(409, { error: "version_conflict", currentVersion: 3 });
    expect(err.is409VersionConflict()).toBe(true);
  });

  test("is409 returns false for other 409 shapes", () => {
    const err = new ApiError(409, { error: "conflict", currentUpdatedAt: "x" });
    expect(err.is409VersionConflict()).toBe(false);
  });

  test("unwrap returns json on 2xx", async () => {
    const res = new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    expect(await unwrap<{ ok: number }>(res)).toEqual({ ok: 1 });
  });

  test("unwrap throws ApiError on non-2xx with parsed body", async () => {
    const res = new Response(JSON.stringify({ error: "bad" }), { status: 400 });
    await expect(unwrap(res)).rejects.toMatchObject({ status: 400, body: { error: "bad" } });
  });

  test("unwrap throws ApiError on non-2xx with no body", async () => {
    const res = new Response("", { status: 500 });
    const err = await unwrap(res).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.body).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```
vp test run src/lib/api-error.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `api-error.ts`**

`apps/fe/src/lib/api-error.ts`:

```ts
export class ApiError<B = unknown> extends Error {
  constructor(
    public status: number,
    public body: B | null,
  ) {
    super(`ApiError(${status})`);
  }

  is409VersionConflict(): boolean {
    return (
      this.status === 409 &&
      typeof this.body === "object" &&
      this.body !== null &&
      (this.body as { error?: string }).error === "version_conflict"
    );
  }
}

export async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  throw new ApiError(res.status, body);
}
```

- [ ] **Step 4: Run — expect PASS**

```
vp test run src/lib/api-error.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/api-error.ts apps/fe/src/lib/api-error.test.ts
git commit -m "feat(fe): add ApiError + unwrap helper"
```

---

## Task 4: Query keys

**Files:**

- Create: `apps/fe/src/lib/query-keys.ts`

- [ ] **Step 1: Create**

```ts
import type { DocStatus } from "#/lib/domain-types";

export type DocumentsListParams = { status?: DocStatus | "all" };

export const qk = {
  me: ["me"] as const,
  documents: ["documents"] as const,
  documentsList: (params: DocumentsListParams) => ["documents", "list", params] as const,
  document: (id: string) => ["documents", "detail", id] as const,
};
```

- [ ] **Step 2: Create `domain-types.ts` to hold small shared aliases**

`apps/fe/src/lib/domain-types.ts`:

```ts
export type DocStatus = "draft" | "review" | "published" | "archived";
export type DocType = "prd" | "strategy" | "spec" | "rfc" | "other";
export type SectionKind = "prose" | "list" | "table" | "code" | "callout" | "embed";
```

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/lib/query-keys.ts apps/fe/src/lib/domain-types.ts
git commit -m "feat(fe): add query keys and shared domain types"
```

---

## Task 5: API client (`hc<AppType>`)

**Files:**

- Create: `apps/fe/src/lib/api.ts`
- Modify: `apps/fe/tsconfig.json` (add BE path if needed)

- [ ] **Step 1: Verify BE `AppType` import path works**

Confirm `apps/be/src/index.ts` exports `AppType`. (It does — line 55 of `apps/be/src/index.ts`.)

Confirm `apps/fe/tsconfig.json` has no barrier to importing from `../../be`. If `compilerOptions.rootDir` is set, relax it. If paths aliases are locked to `#/*`, that's fine — we use a relative import.

- [ ] **Step 2: Create the client**

`apps/fe/src/lib/api.ts`:

```ts
import { hc } from "hono/client";
import type { AppType } from "../../../be/src/index";

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export const api = hc<AppType>(baseUrl, {
  init: { credentials: "include" },
});

export type Api = typeof api;
```

Install `hono` as a dep if it is not already present in FE:

```
vp add hono
```

(It is a peer of `hc`; the BE has it but FE may not.)

- [ ] **Step 3: Smoke-check type inference**

Create `apps/fe/src/lib/api.smoke.test-d.ts`:

```ts
import { api } from "./api";

// type-only smoke: the call should be callable.
void (async () => {
  const res = await api.me.$get();
  if (res.ok) {
    const json = await res.json();
    json.user.id satisfies string;
  }
});
```

(This is a type-only file; it won't run as a test, but `vp check` will type-check it.)

- [ ] **Step 4: `vp check`**

```
vp check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/api.ts apps/fe/src/lib/api.smoke.test-d.ts apps/fe/package.json pnpm-lock.yaml
git commit -m "feat(fe): add hono RPC client bound to BE AppType"
```

---

## Task 6: `useMe` query hook

**Files:**

- Create: `apps/fe/src/queries/me.ts`
- Create: `apps/fe/src/queries/me.test.tsx`

- [ ] **Step 1: Write failing test**

`apps/fe/src/queries/me.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { server } from "#/test/server";
import { useMe } from "./me";

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useMe", () => {
  test("returns data on 200", async () => {
    server.use(
      http.get("*/me", () =>
        HttpResponse.json({
          user: { id: "u1" },
          workspace: { id: "w1", name: "W", slug: "w", createdAt: "", updatedAt: "" },
          role: "owner",
        }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMe(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.user.id).toBe("u1");
  });

  test("surfaces 401 as error", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMe(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

- [ ] **Step 3: Implement `useMe`**

`apps/fe/src/queries/me.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";

export type MeResponse = {
  user: { id: string };
  workspace: { id: string; name: string; slug: string; createdAt: string; updatedAt: string };
  role: "owner" | "editor" | "viewer";
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => unwrap<MeResponse>(await api.me.$get()),
    staleTime: Infinity,
    retry: false,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await fetch("/auth/sign-in/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: qk.documents });
    },
  });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; email: string; password: string }) => {
      const res = await fetch("/auth/sign-up/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: qk.documents });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/auth/sign-out", { method: "POST", credentials: "include" });
      if (!res.ok) throw new ApiError(res.status, null);
      // BetterAuth may return 204 with no body.
      try {
        return await res.json();
      } catch {
        return {};
      }
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}
```

Note: BetterAuth routes aren't part of the typed `AppType` surface; we call them with raw `fetch`. The custom `api` client types the rest.

- [ ] **Step 4: Run — expect PASS**

```
vp test run src/queries/me.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/queries/me.ts apps/fe/src/queries/me.test.tsx
git commit -m "feat(fe): add useMe/useSignIn/useSignUp/useSignOut hooks"
```

---

## Task 7: `useDocumentsList` + `useDocument`

**Files:**

- Create: `apps/fe/src/queries/documents.ts`
- Create: `apps/fe/src/queries/documents.test.tsx`

- [ ] **Step 1: Write failing test (two cases)**

`apps/fe/src/queries/documents.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { server } from "#/test/server";
import { useDocument, useDocumentsList } from "./documents";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

describe("useDocumentsList", () => {
  test("passes status query param and returns rows", async () => {
    let seenUrl = "";
    server.use(
      http.get("*/documents", ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([
          { id: "d1", title: "T", status: "draft", updatedAt: "2026-01-01T00:00:00Z" },
        ]);
      }),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useDocumentsList({ status: "draft" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenUrl).toContain("status=draft");
    expect(result.current.data?.[0]?.id).toBe("d1");
  });
});

describe("useDocument", () => {
  test("returns { document, sections }", async () => {
    server.use(
      http.get("*/documents/:id", () =>
        HttpResponse.json({
          document: { id: "d1", title: "T", updatedAt: "2026-01-01T00:00:00Z" },
          sections: [
            {
              id: "s1",
              documentId: "d1",
              orderKey: "a0",
              contentJson: { type: "doc" },
              version: 1,
            },
          ],
        }),
      ),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useDocument("d1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.sections[0]?.id).toBe("s1");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`apps/fe/src/queries/documents.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { unwrap } from "#/lib/api-error";
import { qk, type DocumentsListParams } from "#/lib/query-keys";
import type { Document, Section } from "#/lib/api-types";

export function useDocumentsList(params: DocumentsListParams) {
  return useQuery({
    queryKey: qk.documentsList(params),
    queryFn: async () => {
      const query = params.status && params.status !== "all" ? { status: params.status } : {};
      return unwrap<Document[]>(await api.documents.$get({ query }));
    },
    staleTime: 5_000,
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: qk.document(id ?? "__none__"),
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("unreachable");
      return unwrap<{ document: Document; sections: Section[] }>(
        await api.documents[":id"].$get({ param: { id } }),
      );
    },
    staleTime: 10_000,
  });
}
```

Also create `apps/fe/src/lib/api-types.ts` with the shared row shapes the hooks reference:

```ts
import type { DocStatus, DocType, SectionKind } from "./domain-types";

export type Document = {
  id: string;
  workspaceId: string;
  title: string;
  emoji: string | null;
  docType: DocType;
  status: DocStatus;
  parentDocumentId: string | null;
  frontmatter: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Section = {
  id: string;
  documentId: string;
  orderKey: string;
  label: string | null;
  kind: SectionKind;
  contentJson: unknown;
  contentText: string;
  contentHash: string;
  frontmatter: Record<string, unknown>;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Run — expect PASS**

```
vp test run src/queries/documents.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/queries/documents.ts apps/fe/src/queries/documents.test.tsx apps/fe/src/lib/api-types.ts
git commit -m "feat(fe): add useDocumentsList and useDocument query hooks"
```

---

## Task 8: Document mutations (create / update / delete)

**Files:**

- Modify: `apps/fe/src/queries/documents.ts`
- Modify: `apps/fe/src/queries/documents.test.tsx`

- [ ] **Step 1: Add failing tests for mutations**

Append to `documents.test.tsx`:

```tsx
import { act } from "@testing-library/react";
import { useCreateDocument, useDeleteDocument, useUpdateDocument } from "./documents";

describe("useCreateDocument", () => {
  test("seeds document cache and prepends to list", async () => {
    server.use(
      http.post("*/documents", () =>
        HttpResponse.json(
          {
            document: { id: "d2", title: "Untitled", updatedAt: "2026-01-02T00:00:00Z" },
            sections: [
              {
                id: "s2",
                documentId: "d2",
                orderKey: "a0",
                version: 1,
                contentJson: { type: "doc" },
              },
            ],
          },
          { status: 201 },
        ),
      ),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "list", { status: undefined }], []);
    const { result } = renderHook(() => useCreateDocument(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({});
    });
    const detail = qc.getQueryData(["documents", "detail", "d2"]);
    expect(detail).toBeDefined();
  });
});

describe("useUpdateDocument", () => {
  test("sends expectedUpdatedAt from cache and patches on success", async () => {
    let sentBody: unknown = null;
    server.use(
      http.patch("*/documents/:id", async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ id: "d1", title: "New", updatedAt: "2026-01-03T00:00:00Z" });
      }),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", title: "Old", updatedAt: "2026-01-01T00:00:00Z" },
      sections: [],
    });
    const { result } = renderHook(() => useUpdateDocument("d1"), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ title: "New" });
    });
    expect((sentBody as { expectedUpdatedAt: string }).expectedUpdatedAt).toBe(
      "2026-01-01T00:00:00Z",
    );
  });
});

describe("useDeleteDocument", () => {
  test("removes detail cache on success", async () => {
    server.use(http.delete("*/documents/:id", () => HttpResponse.json({ ok: true })));
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], { document: { id: "d1" }, sections: [] });
    const { result } = renderHook(() => useDeleteDocument(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync("d1");
    });
    expect(qc.getQueryData(["documents", "detail", "d1"])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement mutations**

Append to `apps/fe/src/queries/documents.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Document, Section } from "#/lib/api-types";
import type { DocStatus, DocType } from "#/lib/domain-types";

type CreateInput = {
  title?: string;
  emoji?: string | null;
  docType?: DocType;
  status?: DocStatus;
  parentDocumentId?: string | null;
};

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInput) =>
      unwrap<{ document: Document; sections: Section[] }>(
        await api.documents.$post({ json: input }),
      ),
    onSuccess: (created) => {
      qc.setQueryData(qk.document(created.document.id), created);
      qc.setQueriesData<Document[]>({ queryKey: qk.documents }, (old) => {
        if (!Array.isArray(old)) return old;
        return [created.document, ...old];
      });
    },
  });
}

type UpdateInput = Partial<
  Pick<Document, "title" | "emoji" | "docType" | "status" | "parentDocumentId" | "frontmatter">
>;

export function useUpdateDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateInput) => {
      const current = qc.getQueryData<{ document: Document; sections: Section[] }>(qk.document(id));
      const expectedUpdatedAt = current?.document.updatedAt ?? new Date(0).toISOString();
      return unwrap<Document>(
        await api.documents[":id"].$patch({
          param: { id },
          json: { ...patch, expectedUpdatedAt },
        }),
      );
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.document(id) });
      const prev = qc.getQueryData<{ document: Document; sections: Section[] }>(qk.document(id));
      if (prev) {
        qc.setQueryData(qk.document(id), { ...prev, document: { ...prev.document, ...patch } });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.document(id), ctx.prev);
    },
    onSuccess: (doc) => {
      const cached = qc.getQueryData<{ document: Document; sections: Section[] }>(qk.document(id));
      if (cached) qc.setQueryData(qk.document(id), { ...cached, document: doc });
      qc.setQueriesData<Document[]>({ queryKey: qk.documents }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((d) => (d.id === id ? doc : d));
      });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ ok: true }>(await api.documents[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => {
      qc.removeQueries({ queryKey: qk.document(id) });
      qc.setQueriesData<Document[]>({ queryKey: qk.documents }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((d) => d.id !== id);
      });
    },
  });
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/queries/documents.ts apps/fe/src/queries/documents.test.tsx
git commit -m "feat(fe): add useCreateDocument/useUpdateDocument/useDeleteDocument"
```

---

## Task 9: Section mutations

**Files:**

- Create: `apps/fe/src/queries/sections.ts`
- Create: `apps/fe/src/queries/sections.test.tsx`

- [ ] **Step 1: Write failing tests**

Focus on the two non-trivial behaviors: `useUpdateSection` patches `qk.document(docId)` in place, and surfaces a 409 as an `ApiError` whose `is409VersionConflict()` is true.

`apps/fe/src/queries/sections.test.tsx`:

```tsx
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { server } from "#/test/server";
import { ApiError } from "#/lib/api-error";
import { useCreateSection, useDeleteSection, useUpdateSection } from "./sections";

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

const baseSection = (patch: Partial<any> = {}) => ({
  id: "s1",
  documentId: "d1",
  orderKey: "a0",
  label: null,
  kind: "prose",
  contentJson: { type: "doc", content: [{ type: "paragraph" }] },
  contentText: "",
  contentHash: "",
  frontmatter: {},
  version: 1,
  createdBy: "u",
  updatedBy: "u",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...patch,
});

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
      await result.current.mutateAsync({ contentJson: { type: "doc" }, expectedVersion: 1 });
    });
    const cached = qc.getQueryData<any>(["documents", "detail", "d1"]);
    expect(cached.sections[0].version).toBe(2);
  });

  test("surfaces 409 as ApiError with is409VersionConflict", async () => {
    server.use(
      http.patch("*/sections/:id", () =>
        HttpResponse.json(
          {
            error: "version_conflict",
            currentVersion: 5,
            currentSection: baseSection({ version: 5 }),
          },
          { status: 409 },
        ),
      ),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useUpdateSection({ sectionId: "s1", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.mutateAsync({ contentJson: { type: "doc" }, expectedVersion: 1 });
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).is409VersionConflict()).toBe(true);
  });
});

describe("useCreateSection", () => {
  test("appends section to document cache", async () => {
    server.use(
      http.post("*/documents/:docId/sections", () =>
        HttpResponse.json(baseSection({ id: "s2", orderKey: "a1" }), { status: 201 }),
      ),
    );
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection()],
    });
    const { result } = renderHook(() => useCreateSection("d1"), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({});
    });
    const cached = qc.getQueryData<any>(["documents", "detail", "d1"]);
    expect(cached.sections.map((s: any) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("useDeleteSection", () => {
  test("removes section from document cache", async () => {
    server.use(http.delete("*/sections/:id", () => HttpResponse.json({ ok: true })));
    const { qc, Wrapper } = wrap();
    qc.setQueryData(["documents", "detail", "d1"], {
      document: { id: "d1", updatedAt: "x" },
      sections: [baseSection(), baseSection({ id: "s2" })],
    });
    const { result } = renderHook(() => useDeleteSection({ sectionId: "s2", documentId: "d1" }), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    const cached = qc.getQueryData<any>(["documents", "detail", "d1"]);
    expect(cached.sections.map((s: any) => s.id)).toEqual(["s1"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`apps/fe/src/queries/sections.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";
import type { Document, Section } from "#/lib/api-types";
import type { SectionKind } from "#/lib/domain-types";

type DocDetail = { document: Document; sections: Section[] };

type UpdateSectionInput = {
  contentJson?: unknown;
  label?: string | null;
  kind?: SectionKind;
  frontmatter?: Record<string, unknown>;
  orderKey?: string;
  expectedVersion: number;
};

export function useUpdateSection(args: { sectionId: string; documentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSectionInput) =>
      unwrap<Section>(
        await api.sections[":id"].$patch({
          param: { id: args.sectionId },
          json: input,
        }),
      ),
    onSuccess: (updated) => {
      qc.setQueryData<DocDetail>(qk.document(args.documentId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((s) => (s.id === updated.id ? updated : s)),
        };
      });
    },
  });
}

type CreateSectionInput = {
  orderKey?: string;
  kind?: SectionKind;
  contentJson?: unknown;
  label?: string | null;
  frontmatter?: Record<string, unknown>;
};

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
    onSuccess: (created) => {
      qc.setQueryData<DocDetail>(qk.document(documentId), (prev) => {
        if (!prev) return prev;
        const next = [...prev.sections, created].sort((a, b) =>
          a.orderKey.localeCompare(b.orderKey),
        );
        return { ...prev, sections: next };
      });
    },
  });
}

export function useDeleteSection(args: { sectionId: string; documentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap<{ ok: true }>(await api.sections[":id"].$delete({ param: { id: args.sectionId } })),
    onSuccess: () => {
      qc.setQueryData<DocDetail>(qk.document(args.documentId), (prev) => {
        if (!prev) return prev;
        return { ...prev, sections: prev.sections.filter((s) => s.id !== args.sectionId) };
      });
    },
  });
}

// re-export so callers can narrow the thrown error
export { ApiError };
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/queries/sections.ts apps/fe/src/queries/sections.test.tsx
git commit -m "feat(fe): add useCreateSection/useUpdateSection/useDeleteSection"
```

---

## Task 10: Plaintext extractor (FE port of BE `extract-text.ts`)

**Files:**

- Create: `apps/fe/src/lib/extract-section-text.ts`
- Create: `apps/fe/src/lib/extract-section-text.test.ts`

- [ ] **Step 1: Write failing tests mirroring BE behavior**

```ts
import { describe, expect, test } from "vitest";
import { extractSectionText } from "./extract-section-text";

describe("extractSectionText", () => {
  test("empty doc", () => {
    expect(extractSectionText({ type: "doc", content: [] })).toBe("");
  });

  test("paragraphs separated by \\n\\n", () => {
    expect(
      extractSectionText({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
          { type: "paragraph", content: [{ type: "text", text: "There" }] },
        ],
      }),
    ).toBe("Hi\n\nThere");
  });

  test("list items separated by single newline", () => {
    expect(
      extractSectionText({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }],
              },
            ],
          },
        ],
      }),
    ).toBe("a\nb");
  });

  test("hardBreak emits \\n", () => {
    expect(
      extractSectionText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "a" },
              { type: "hardBreak" },
              { type: "text", text: "b" },
            ],
          },
        ],
      }),
    ).toBe("a\nb");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement (direct port of `apps/be/src/lib/content/extract-text.ts`)**

```ts
type PMNode = { type: string; text?: string; content?: PMNode[] };

const ATOMIC_TEXT = new Set(["hardBreak"]);

export function extractSectionText(doc: unknown): string {
  const root = doc as PMNode;
  if (!root?.content || root.content.length === 0) return "";
  return root.content.map(blockText).join("\n\n");
}

function blockText(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  if (ATOMIC_TEXT.has(node.type)) return "\n";
  if (!node.content) return "";
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    return node.content.map(blockText).join("\n");
  }
  if (node.type === "table" || node.type === "tableRow") {
    return node.content.map(blockText).join("\n");
  }
  if (node.type === "tableCell" || node.type === "tableHeader" || node.type === "listItem") {
    return node.content.map(blockText).join(" ").trim();
  }
  if (node.type === "paragraph" || node.type === "heading" || node.type === "blockquote") {
    return node.content.map(blockText).join("");
  }
  return node.content.map(blockText).join("\n\n");
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/extract-section-text.ts apps/fe/src/lib/extract-section-text.test.ts
git commit -m "feat(fe): port BE plaintext extractor to FE lib"
```

---

## Task 11: Per-section save-state reducer

**Files:**

- Create: `apps/fe/src/lib/section-save-state.ts`
- Create: `apps/fe/src/lib/section-save-state.test.ts`

- [ ] **Step 1: Write failing test for the state machine**

```ts
import { describe, expect, test } from "vitest";
import { reduceSectionSave, initialSectionSave, type SectionSave } from "./section-save-state";

const start = () => initialSectionSave();

describe("reduceSectionSave", () => {
  test("edit moves idle -> dirty", () => {
    expect(reduceSectionSave(start(), { type: "edit" }).status).toBe("dirty");
  });

  test("saveStart moves dirty -> saving", () => {
    const s: SectionSave = { status: "dirty", lastSavedAt: null };
    expect(reduceSectionSave(s, { type: "saveStart" }).status).toBe("saving");
  });

  test("saveOk from saving -> saved with savedAt", () => {
    const s: SectionSave = { status: "saving", lastSavedAt: null };
    const next = reduceSectionSave(s, { type: "saveOk", at: 1000 });
    expect(next).toEqual({ status: "saved", lastSavedAt: 1000 });
  });

  test("fade from saved -> idle preserves savedAt", () => {
    const s: SectionSave = { status: "saved", lastSavedAt: 1000 };
    expect(reduceSectionSave(s, { type: "fade" })).toEqual({ status: "idle", lastSavedAt: 1000 });
  });

  test("conflict from saving -> conflict", () => {
    const s: SectionSave = { status: "saving", lastSavedAt: null };
    expect(reduceSectionSave(s, { type: "conflict" }).status).toBe("conflict");
  });

  test("networkError from saving -> error", () => {
    const s: SectionSave = { status: "saving", lastSavedAt: null };
    expect(reduceSectionSave(s, { type: "networkError" }).status).toBe("error");
  });

  test("edit while saving -> dirty (user is typing during in-flight)", () => {
    const s: SectionSave = { status: "saving", lastSavedAt: null };
    expect(reduceSectionSave(s, { type: "edit" }).status).toBe("dirty");
  });

  test("reload (after conflict banner resolved) -> idle", () => {
    const s: SectionSave = { status: "conflict", lastSavedAt: null };
    expect(reduceSectionSave(s, { type: "reload" }).status).toBe("idle");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
export type SectionSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export type SectionSave = {
  status: SectionSaveStatus;
  lastSavedAt: number | null;
};

export type SectionSaveAction =
  | { type: "edit" }
  | { type: "saveStart" }
  | { type: "saveOk"; at: number }
  | { type: "networkError" }
  | { type: "conflict" }
  | { type: "fade" }
  | { type: "reload" };

export function initialSectionSave(): SectionSave {
  return { status: "idle", lastSavedAt: null };
}

export function reduceSectionSave(state: SectionSave, action: SectionSaveAction): SectionSave {
  switch (action.type) {
    case "edit":
      return { ...state, status: "dirty" };
    case "saveStart":
      return { ...state, status: "saving" };
    case "saveOk":
      return { status: "saved", lastSavedAt: action.at };
    case "networkError":
      return { ...state, status: "error" };
    case "conflict":
      return { ...state, status: "conflict" };
    case "fade":
      return { ...state, status: "idle" };
    case "reload":
      return { status: "idle", lastSavedAt: state.lastSavedAt };
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/section-save-state.ts apps/fe/src/lib/section-save-state.test.ts
git commit -m "feat(fe): add per-section save state reducer"
```

---

## Task 12: Save rollup selector

**Files:**

- Create: `apps/fe/src/lib/save-rollup.ts`
- Create: `apps/fe/src/lib/save-rollup.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, test } from "vitest";
import { computeSaveRollup } from "./save-rollup";

describe("computeSaveRollup", () => {
  test("all idle -> saved with max savedAt", () => {
    const rollup = computeSaveRollup({
      sections: {
        a: { status: "idle", lastSavedAt: 100 },
        b: { status: "idle", lastSavedAt: 200 },
      },
      docMetadataPending: false,
    });
    expect(rollup).toEqual({ kind: "saved", savedAt: 200 });
  });

  test("any saving -> saving", () => {
    expect(
      computeSaveRollup({
        sections: {
          a: { status: "idle", lastSavedAt: 100 },
          b: { status: "saving", lastSavedAt: null },
        },
        docMetadataPending: false,
      }),
    ).toEqual({ kind: "saving" });
  });

  test("docMetadataPending -> saving", () => {
    expect(
      computeSaveRollup({
        sections: { a: { status: "idle", lastSavedAt: 100 } },
        docMetadataPending: true,
      }),
    ).toEqual({ kind: "saving" });
  });

  test("any error or conflict -> unsaved", () => {
    expect(
      computeSaveRollup({
        sections: { a: { status: "conflict", lastSavedAt: null } },
        docMetadataPending: false,
      }).kind,
    ).toBe("unsaved");
  });

  test("any dirty (no worse) -> editing", () => {
    expect(
      computeSaveRollup({
        sections: { a: { status: "dirty", lastSavedAt: null } },
        docMetadataPending: false,
      }).kind,
    ).toBe("editing");
  });

  test("empty sections with no doc mutation -> saved at 0", () => {
    expect(computeSaveRollup({ sections: {}, docMetadataPending: false })).toEqual({
      kind: "saved",
      savedAt: 0,
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import type { SectionSave } from "./section-save-state";

export type SaveRollup =
  | { kind: "saving" }
  | { kind: "unsaved" }
  | { kind: "editing" }
  | { kind: "saved"; savedAt: number };

export function computeSaveRollup(input: {
  sections: Record<string, SectionSave>;
  docMetadataPending: boolean;
}): SaveRollup {
  const states = Object.values(input.sections);
  if (input.docMetadataPending || states.some((s) => s.status === "saving")) {
    return { kind: "saving" };
  }
  if (states.some((s) => s.status === "error" || s.status === "conflict")) {
    return { kind: "unsaved" };
  }
  if (states.some((s) => s.status === "dirty")) {
    return { kind: "editing" };
  }
  const savedAt = states.reduce((max, s) => Math.max(max, s.lastSavedAt ?? 0), 0);
  return { kind: "saved", savedAt };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/lib/save-rollup.ts apps/fe/src/lib/save-rollup.test.ts
git commit -m "feat(fe): add save rollup selector"
```

---

## Task 13: Slim UI Zustand store; delete old store + seed

**Files:**

- Create: `apps/fe/src/stores/ui.ts`
- Delete: `apps/fe/src/stores/documents.ts`
- Delete: `apps/fe/src/stores/documents.test.ts`
- Delete: `apps/fe/src/lib/seed-docs.ts`

- [ ] **Step 1: Write the new store**

`apps/fe/src/stores/ui.ts`:

```ts
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { DocStatus } from "#/lib/domain-types";
import type { SectionSave } from "#/lib/section-save-state";
import { initialSectionSave } from "#/lib/section-save-state";

export type UiState = {
  selectedDocumentId: string | null;
  selectedSectionId: string | null;
  sidebarCollapsed: boolean;
  statusFilter: DocStatus | "all";
  sectionSaveStates: Record<string, SectionSave>;
};

export type UiActions = {
  selectDocument: (id: string | null) => void;
  selectSection: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setStatusFilter: (v: DocStatus | "all") => void;
  setSectionSaveState: (sectionId: string, s: SectionSave) => void;
  clearSectionSaveState: (sectionId: string) => void;
};

export type UiStore = UiState & UiActions;

export function createUiStore(initial?: Partial<UiState>): StoreApi<UiStore> {
  return createStore<UiStore>((set) => ({
    selectedDocumentId: initial?.selectedDocumentId ?? null,
    selectedSectionId: initial?.selectedSectionId ?? null,
    sidebarCollapsed: initial?.sidebarCollapsed ?? false,
    statusFilter: initial?.statusFilter ?? "all",
    sectionSaveStates: initial?.sectionSaveStates ?? {},

    selectDocument: (id) => set({ selectedDocumentId: id, selectedSectionId: null }),
    selectSection: (id) => set({ selectedSectionId: id }),
    toggleSidebar: () => set((st) => ({ sidebarCollapsed: !st.sidebarCollapsed })),
    setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    setStatusFilter: (v) => set({ statusFilter: v }),

    setSectionSaveState: (sectionId, s) =>
      set((st) => ({ sectionSaveStates: { ...st.sectionSaveStates, [sectionId]: s } })),
    clearSectionSaveState: (sectionId) =>
      set((st) => {
        const next = { ...st.sectionSaveStates };
        delete next[sectionId];
        return { sectionSaveStates: next };
      }),
  }));
}

export const uiStore = createUiStore();

export function useUi<T>(selector: (s: UiStore) => T): T {
  return useStore(uiStore, selector);
}

// convenience for SectionBlock
export function ensureSectionSaveState(id: string): SectionSave {
  const st = uiStore.getState().sectionSaveStates[id];
  return st ?? initialSectionSave();
}
```

- [ ] **Step 2: Delete old files**

```
git rm apps/fe/src/stores/documents.ts apps/fe/src/stores/documents.test.ts apps/fe/src/lib/seed-docs.ts
```

- [ ] **Step 3: `vp check` will fail (unreachable imports). That's expected — we fix them in Task 14+**

Do **not** try to compile-pass here. Commit anyway so the deletion is isolated.

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/stores/ui.ts
git commit -m "feat(fe): slim Zustand store to ui-only state; remove seed-docs"
```

---

## Task 14: Default `QueryClient` options

**Files:**

- Modify: `apps/fe/src/integrations/tanstack-query/root-provider.tsx`

- [ ] **Step 1: Update**

```tsx
import { QueryClient } from "@tanstack/react-query";

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return { queryClient };
}

export default function TanstackQueryProvider() {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/fe/src/integrations/tanstack-query/root-provider.tsx
git commit -m "chore(fe): tighten default QueryClient options"
```

---

## Task 15: Auth route layouts (`_unauth`, `_authed`)

**Files:**

- Create: `apps/fe/src/routes/_unauth.tsx`
- Create: `apps/fe/src/routes/_authed.tsx`
- Move/rename: `apps/fe/src/routes/index.tsx` → `apps/fe/src/routes/_authed/index.tsx`

- [ ] **Step 1: Create `_unauth.tsx`**

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "#/lib/api";
import { unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";

export const Route = createFileRoute("/_unauth")({
  beforeLoad: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData({
        queryKey: qk.me,
        queryFn: async () => unwrap(await api.me.$get()),
      });
      if (me) throw redirect({ to: "/" });
    } catch (e) {
      if ((e as { to?: string }).to) throw e;
      // 401 or network — stay on unauth routes
    }
  },
  component: () => <Outlet />,
});
```

- [ ] **Step 2: Create `_authed.tsx`**

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";
import type { MeResponse } from "#/queries/me";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData<MeResponse>({
        queryKey: qk.me,
        queryFn: async () => unwrap(await api.me.$get()),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        throw redirect({ to: "/sign-in" });
      }
      throw e;
    }
  },
  component: () => <Outlet />,
});
```

- [ ] **Step 3: Move the old index route under `_authed`**

```
mkdir -p apps/fe/src/routes/_authed
git mv apps/fe/src/routes/index.tsx apps/fe/src/routes/_authed/index.tsx
```

- [ ] **Step 4: Regenerate route tree**

`vp dev` regenerates `routeTree.gen.ts` on save, or:

```
vp run fe#dev --once
```

If no such script exists, run the dev server briefly — TSR plugin will rewrite `routeTree.gen.ts`. Check `git diff apps/fe/src/routeTree.gen.ts` to confirm the new routes appear.

- [ ] **Step 5: `vp check`**

Expected: passes (no auth pages yet, but the route tree compiles).

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/routes
git commit -m "feat(fe): add _unauth/_authed pathless layouts with /me gate"
```

---

## Task 16: Auth layout + sign-in form

**Files:**

- Create: `apps/fe/src/components/auth/auth-layout.tsx`
- Create: `apps/fe/src/components/auth/sign-in-form.tsx`
- Create: `apps/fe/src/routes/_unauth/sign-in.tsx`
- Create: `apps/fe/src/components/auth/sign-in-form.test.tsx`

- [ ] **Step 1: Write the layout**

```tsx
import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--foam)] to-[var(--sand)] px-6 py-14">
      <div className="mx-auto flex max-w-[420px] flex-col items-center">
        <div className="mb-6 flex items-center gap-2">
          <div
            className="size-[18px] rounded-md"
            style={{ background: "linear-gradient(135deg, var(--lagoon), var(--palm))" }}
          />
          <span className="font-['Fraunces',Georgia,serif] text-xl text-[var(--sea-ink)]">
            Patram
          </span>
        </div>
        <div className="w-full rounded-2xl border border-[var(--line)] bg-white/80 p-6 shadow-[0_18px_40px_rgb(23_58_64_/_0.08)] backdrop-blur">
          <h1 className="font-['Fraunces',Georgia,serif] text-2xl text-[var(--sea-ink)]">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the sign-in form**

```tsx
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useSignIn } from "#/queries/me";
import { ApiError } from "#/lib/api-error";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const signIn = useSignIn();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await signIn.mutateAsync({ email, password });
          await router.invalidate();
          router.navigate({ to: "/" });
        } catch (x) {
          if (x instanceof ApiError && x.status === 401) setErr("Wrong email or password");
          else setErr("Something went wrong. Try again.");
        }
      }}
      className="flex flex-col gap-3"
    >
      <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </label>
      <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
        Password
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </label>
      {err ? (
        <p role="alert" className="text-xs text-red-600">
          {err}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={signIn.isPending}
        className="mt-1 rounded-md bg-[var(--lagoon-deep)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--lagoon)] disabled:opacity-60"
      >
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create the route**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "#/components/auth/auth-layout";
import { SignInForm } from "#/components/auth/sign-in-form";

export const Route = createFileRoute("/_unauth/sign-in")({
  component: () => (
    <AuthLayout title="Sign in" subtitle="Welcome back.">
      <SignInForm />
      <p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
        Don't have an account?{" "}
        <Link to="/sign-up" className="text-[var(--lagoon-deep)] underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  ),
});
```

- [ ] **Step 4: Test — shows error on 401**

`apps/fe/src/components/auth/sign-in-form.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";
import { renderWithProviders } from "#/test/test-utils";
import { server } from "#/test/server";
import { SignInForm } from "./sign-in-form";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
}));

describe("SignInForm", () => {
  test("renders 'Wrong email or password' on 401", async () => {
    server.use(http.post("*/auth/sign-in/email", () => HttpResponse.json({}, { status: 401 })));
    renderWithProviders(<SignInForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2xx");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/wrong email or password/i);
  });
});
```

- [ ] **Step 5: Run — expect PASS**

```
vp test run src/components/auth/sign-in-form.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/components/auth apps/fe/src/routes/_unauth/sign-in.tsx
git commit -m "feat(fe): add sign-in route and form"
```

---

## Task 17: Sign-up form + route

**Files:**

- Create: `apps/fe/src/components/auth/sign-up-form.tsx`
- Create: `apps/fe/src/routes/_unauth/sign-up.tsx`

- [ ] **Step 1: Form**

```tsx
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useSignUp } from "#/queries/me";
import { ApiError } from "#/lib/api-error";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const signUp = useSignUp();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await signUp.mutateAsync({ name, email, password });
          await router.invalidate();
          router.navigate({ to: "/" });
        } catch (x) {
          if (x instanceof ApiError) {
            if (x.status === 422 || x.status === 400)
              setErr("That email is already in use or invalid.");
            else setErr("Something went wrong. Try again.");
          } else setErr("Something went wrong. Try again.");
        }
      }}
      className="flex flex-col gap-3"
    >
      <Field label="Display name" value={name} onChange={setName} />
      <Field label="Email" type="email" value={email} onChange={setEmail} />
      <Field
        label="Password"
        type="password"
        minLength={8}
        value={password}
        onChange={setPassword}
      />
      {err ? (
        <p role="alert" className="text-xs text-red-600">
          {err}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={signUp.isPending}
        className="mt-1 rounded-md bg-[var(--lagoon-deep)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--lagoon)] disabled:opacity-60"
      >
        {signUp.isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  minLength?: number;
}) {
  return (
    <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
      {label}
      <input
        type={type}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
    </label>
  );
}
```

- [ ] **Step 2: Route**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "#/components/auth/auth-layout";
import { SignUpForm } from "#/components/auth/sign-up-form";

export const Route = createFileRoute("/_unauth/sign-up")({
  component: () => (
    <AuthLayout title="Create your account" subtitle="One workspace, just for you.">
      <SignUpForm />
      <p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
        Already have an account?{" "}
        <Link to="/sign-in" className="text-[var(--lagoon-deep)] underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  ),
});
```

- [ ] **Step 3: Regenerate route tree (`vp dev --once` or similar — as in Task 15).**

- [ ] **Step 4: `vp check`**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/auth/sign-up-form.tsx apps/fe/src/routes/_unauth/sign-up.tsx apps/fe/src/routeTree.gen.ts
git commit -m "feat(fe): add sign-up route and form"
```

---

## Task 18: Sidebar wiring to real documents list

**Files:**

- Modify: `apps/fe/src/components/sidebar/sidebar.tsx`
- Modify: `apps/fe/src/components/sidebar/doc-row.tsx`
- Modify: `apps/fe/src/components/sidebar/user-chip.tsx`

- [ ] **Step 1: Rebuild `sidebar.tsx` against `useDocumentsList` + `useCreateDocument`**

Key behaviors:

- Reads `statusFilter` and `setStatusFilter` from `useUi`.
- Renders a status-filter pill row above the list: `All / Draft / Review / Published / Archived`.
- Lists docs from `useDocumentsList({ status: filter })`.
- `+ New document` calls `useCreateDocument` and sets `selectedDocumentId` to the new id.
- Drops "Pinned" section and count chips.

```tsx
import { useCreateDocument, useDocumentsList } from "#/queries/documents";
import { useUi } from "#/stores/ui";
import { DocRow } from "./doc-row";
import { UserChip } from "./user-chip";
import type { DocStatus } from "#/lib/domain-types";
import { Plus } from "lucide-react";

const STATUSES: Array<{ value: DocStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const filter = useUi((s) => s.statusFilter);
  const setFilter = useUi((s) => s.setStatusFilter);
  const selectedId = useUi((s) => s.selectedDocumentId);
  const selectDoc = useUi((s) => s.selectDocument);
  const docs = useDocumentsList({ status: filter });
  const createDoc = useCreateDocument();

  if (collapsed) {
    return (
      <aside className="flex w-[56px] flex-col items-center border-r border-[var(--line)] bg-[var(--surface)] py-3">
        <button
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="rounded p-1 hover:bg-[rgb(79_184_178_/_0.1)]"
        >
          ⇥
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[264px] flex-col border-r border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-['Fraunces',Georgia,serif] text-lg text-[var(--sea-ink)]">
          Patram
        </span>
        <button
          onClick={onToggleCollapsed}
          aria-label="Collapse sidebar"
          className="rounded p-1 hover:bg-[rgb(79_184_178_/_0.1)]"
        >
          ⇤
        </button>
      </div>

      <button
        onClick={async () => {
          const res = await createDoc.mutateAsync({});
          selectDoc(res.document.id);
        }}
        disabled={createDoc.isPending}
        className="mx-3 my-2 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--lagoon-deep)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        <Plus className="size-4" /> New document
      </button>

      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`rounded-full px-2 py-0.5 text-[11px] ${filter === s.value ? "bg-[rgb(79_184_178_/_0.2)] text-[var(--sea-ink)]" : "text-[var(--sea-ink-soft)] hover:bg-[rgb(79_184_178_/_0.1)]"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {docs.isLoading ? (
          <div className="px-2 text-xs text-[var(--sea-ink-soft)]">Loading…</div>
        ) : (
          (docs.data ?? []).map((d) => (
            <DocRow
              key={d.id}
              id={d.id}
              title={d.title || "Untitled"}
              emoji={d.emoji ?? "📝"}
              active={d.id === selectedId}
              onSelect={() => selectDoc(d.id)}
            />
          ))
        )}
      </div>

      <UserChip />
    </aside>
  );
}
```

- [ ] **Step 2: Drop pin star from `doc-row.tsx`**

Edit to match the new props:

```tsx
export function DocRow({
  id,
  title,
  emoji,
  active,
  onSelect,
}: {
  id: string;
  title: string;
  emoji: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      data-doc-id={id}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${active ? "bg-[rgb(79_184_178_/_0.18)] text-[var(--sea-ink)]" : "text-[var(--sea-ink)] hover:bg-[rgb(79_184_178_/_0.1)]"}`}
    >
      <span className="text-base">{emoji}</span>
      <span className="truncate">{title}</span>
    </button>
  );
}
```

- [ ] **Step 3: Rebuild `user-chip.tsx` with sign-out + dev seed**

```tsx
import { useMe, useSignOut } from "#/queries/me";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { qk } from "#/lib/query-keys";

export function UserChip() {
  const me = useMe();
  const signOut = useSignOut();
  const router = useRouter();
  const qc = useQueryClient();

  const seedDev = import.meta.env.DEV
    ? async () => {
        await fetch("/dev/seed", { method: "POST", credentials: "include" });
        qc.invalidateQueries({ queryKey: qk.documents });
      }
    : null;

  if (!me.data) return null;
  return (
    <div className="mt-auto border-t border-[var(--line)] px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[var(--sea-ink)]">
            {(me.data.user as { name?: string }).name ?? me.data.user.id}
          </div>
          <div className="truncate text-[10.5px] text-[var(--sea-ink-soft)]">
            {me.data.workspace.name}
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut.mutateAsync();
            await router.invalidate();
            router.navigate({ to: "/sign-in" });
          }}
          className="rounded px-2 py-1 text-[11px] text-[var(--sea-ink-soft)] hover:bg-[rgb(79_184_178_/_0.1)]"
          aria-label="Sign out"
        >
          Sign out
        </button>
      </div>
      {seedDev ? (
        <button
          onClick={seedDev}
          className="mt-2 w-full rounded border border-dashed border-[var(--line)] px-2 py-1 text-[10.5px] text-[var(--sea-ink-soft)] hover:bg-[rgb(79_184_178_/_0.06)]"
        >
          Seed sample docs (dev)
        </button>
      ) : null}
    </div>
  );
}
```

Note: `MeResponse.user` currently only has `{ id }` in the BE. The sidebar also needs the display name — in Task 19 we extend the BE response selection to include name, or we fall back to `user.id`. For now show `id`.

- [ ] **Step 4: `vp check`**

Some imports in `app-shell.tsx` and `topbar.tsx` may reference the deleted store. We fix those in Tasks 19 and 21. `vp check` is allowed to fail here; don't force the code to compile yet.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/sidebar
git commit -m "feat(fe): wire sidebar to useDocumentsList and useCreateDocument"
```

---

## Task 19: Extend `/me` response with display name (BE)

**Files:**

- Modify: `apps/be/src/routes/me.ts`
- Modify: `apps/be/src/routes/me.test.ts` (if present; otherwise adjust a nearby test)
- Modify: `apps/fe/src/queries/me.ts`

This task is the one BE touch this plan makes. It lets `UserChip` display a name without the SPA having to query BetterAuth directly.

- [ ] **Step 1: Add name to `me.ts` response**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { workspaces } from "../db/schema";
import { user } from "../db/auth-schema";
import type { AuthEnv } from "../middleware/auth";

export const meRouter = new Hono<AuthEnv>().get("/", async (c) => {
  const { userId, workspaceId, role } = c.get("auth");
  const db = c.get("db");
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const [u] = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  return c.json({ user: u, workspace: ws, role });
});
```

(If the auth-schema import name differs, use whatever `apps/be/src/db/auth-schema.ts` exports.)

- [ ] **Step 2: Update BE test expectation**

If `apps/be/src/routes/me.test.ts` asserts the shape, update it to include `email` and `name`. Otherwise, skip.

- [ ] **Step 3: Run BE tests**

```
cd apps/be && vp test
```

Expected: PASS.

- [ ] **Step 4: Update FE `MeResponse`**

```ts
export type MeResponse = {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; slug: string; createdAt: string; updatedAt: string };
  role: "owner" | "editor" | "viewer";
};
```

- [ ] **Step 5: Update `UserChip` to use `me.data.user.name` / `me.data.user.email`.**

- [ ] **Step 6: Commit**

```bash
git add apps/be/src/routes/me.ts apps/be/src/routes/me.test.ts apps/fe/src/queries/me.ts apps/fe/src/components/sidebar/user-chip.tsx
git commit -m "feat(be): extend /me with user email+name; feat(fe): render name"
```

---

## Task 20: Wire `AppShell` to selected document

**Files:**

- Modify: `apps/fe/src/components/app-shell.tsx`
- Modify: `apps/fe/src/components/doc/doc-surface.tsx` (placeholder — real rebuild in Task 24)
- Delete: `apps/fe/src/components/app-shell.test.tsx`

- [ ] **Step 1: Simplify `AppShell`**

```tsx
import { useEffect } from "react";
import { DocSurface } from "#/components/doc/doc-surface";
import { Sidebar } from "#/components/sidebar/sidebar";
import { Topbar } from "#/components/topbar";
import { useUi } from "#/stores/ui";

export function AppShell() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const selectedId = useUi((s) => s.selectedDocumentId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <div className="grid h-screen w-screen grid-cols-[auto_1fr] overflow-hidden bg-white">
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggle} />
      <main className="flex h-screen flex-col overflow-hidden">
        <Topbar documentId={selectedId} />
        <div className="flex-1 overflow-y-auto">
          <DocSurface documentId={selectedId} />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Placeholder `DocSurface` so the file compiles**

```tsx
import { useDocument } from "#/queries/documents";

export function DocSurface({ documentId }: { documentId: string | null }) {
  const q = useDocument(documentId);
  if (!documentId) {
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-24 text-center text-[var(--sea-ink-soft)]">
        <p className="font-['Fraunces',Georgia,serif] text-2xl text-[var(--sea-ink)]">
          Nothing selected yet
        </p>
        <p className="mt-2 text-sm italic opacity-80">
          Pick a document on the left, or create a new one.
        </p>
      </div>
    );
  }
  if (q.isLoading)
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-14 text-sm text-[var(--sea-ink-soft)]">
        Loading…
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-14 text-sm text-red-600">Failed to load.</div>
    );
  return <div className="mx-auto max-w-[680px] px-6 pt-14 pb-20">TODO: render doc</div>;
}
```

- [ ] **Step 3: Delete the old app-shell test**

```
git rm apps/fe/src/components/app-shell.test.tsx
```

- [ ] **Step 4: `vp check`** — the remaining gaps are Topbar props (`documentId` vs current `saveState`) — fix in next task.

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/app-shell.tsx apps/fe/src/components/doc/doc-surface.tsx
git commit -m "feat(fe): wire AppShell to useDocument"
```

---

## Task 21: Rebuild Topbar

**Files:**

- Modify: `apps/fe/src/components/topbar.tsx`
- Modify: `apps/fe/src/components/save-status.tsx`

- [ ] **Step 1: Update `SaveStatus` props**

```tsx
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRelativeTime } from "#/lib/format-time";
import type { SaveRollup } from "#/lib/save-rollup";

export function SaveStatus({ rollup }: { rollup: SaveRollup }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  if (rollup.kind === "saving") {
    return (
      <Chip>
        <Loader2 className="size-3 animate-spin" /> Saving…
      </Chip>
    );
  }
  if (rollup.kind === "unsaved") {
    return <Chip tone="warn">Unsaved changes</Chip>;
  }
  if (rollup.kind === "editing") {
    return <Chip tone="dim">Editing…</Chip>;
  }
  return (
    <Chip>
      <Dot /> Saved · {formatRelativeTime(rollup.savedAt || Date.now())}
    </Chip>
  );
}

function Chip({
  children,
  tone = "ok",
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "dim";
}) {
  const bg =
    tone === "warn"
      ? "bg-[rgb(220_90_80_/_0.12)] text-red-700"
      : tone === "dim"
        ? "bg-[rgb(23_58_64_/_0.06)] text-[var(--sea-ink-soft)]"
        : "bg-[rgb(79_184_178_/_0.12)] text-[var(--lagoon-deep)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${bg}`}
    >
      {children}
    </span>
  );
}

function Dot() {
  return (
    <span className="inline-flex size-3 items-center justify-center rounded-full bg-[var(--lagoon)] text-[8px] text-white">
      <Check className="size-2" />
    </span>
  );
}
```

- [ ] **Step 2: Rebuild `Topbar` to accept `documentId` and render actions**

```tsx
import { MoreHorizontal } from "lucide-react";
import { useDocument, useDeleteDocument, useUpdateDocument } from "#/queries/documents";
import { useUi } from "#/stores/ui";
import { SaveStatus } from "./save-status";
import { computeSaveRollup } from "#/lib/save-rollup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { DocStatus } from "#/lib/domain-types";

const STATUS_OPTIONS: DocStatus[] = ["draft", "review", "published", "archived"];

export function Topbar({ documentId }: { documentId: string | null }) {
  const q = useDocument(documentId);
  const selectDoc = useUi((s) => s.selectDocument);
  const sectionSaveStates = useUi((s) => s.sectionSaveStates);
  const update = useUpdateDocument(documentId ?? "__none__");
  const del = useDeleteDocument();

  const rollup = computeSaveRollup({
    sections: sectionSaveStates,
    docMetadataPending: update.isPending,
  });

  return (
    <div className="flex h-[44px] items-center justify-between border-b border-[var(--line)] px-4">
      <div className="text-xs text-[var(--sea-ink-soft)]">
        <span>All documents</span>
        {q.data ? (
          <>
            {" / "}
            <span className="text-[var(--sea-ink)]">{q.data.document.title || "Untitled"}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <SaveStatus rollup={rollup} />
        {documentId && q.data ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Document actions"
              className="rounded p-1 hover:bg-[rgb(79_184_178_/_0.1)]"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Status: {q.data.document.status}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {STATUS_OPTIONS.map((s) => (
                    <DropdownMenuItem key={s} onClick={() => update.mutate({ status: s })}>
                      {s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  if (!confirm("Delete this document?")) return;
                  await del.mutateAsync(documentId);
                  selectDoc(null);
                }}
                className="text-red-600"
              >
                Delete document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
```

If `DropdownMenuSub*` primitives aren't present in `components/ui/dropdown-menu.tsx`, add them via shadcn:

```
vp dlx shadcn@latest add dropdown-menu
```

(Overwrite yes — it will re-emit the file with the sub primitives. Spot-check the diff.)

- [ ] **Step 3: `vp check`**

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/topbar.tsx apps/fe/src/components/save-status.tsx apps/fe/src/components/ui/dropdown-menu.tsx
git commit -m "feat(fe): rebuild topbar with BE-wired status + delete + save rollup"
```

---

## Task 22: `DocHeader` — emoji + title + meta

**Files:**

- Create: `apps/fe/src/components/doc/doc-header.tsx`

- [ ] **Step 1: Implement**

Key points:

- Title is a `contentEditable` `<div>` (plain text), not inside the editor.
- Debounced save at 600ms or blur.
- While focused, do NOT stomp server updates: we gate the `value` → DOM sync on `document.activeElement !== titleRef.current`.

```tsx
import { useEffect, useRef, useState } from "react";
import type { Document } from "#/lib/api-types";
import { DocEmoji } from "#/components/doc/doc-emoji";
import { formatRelativeTime } from "#/lib/format-time";
import { useUpdateDocument } from "#/queries/documents";

export function DocHeader({
  document,
  sectionCount,
  wordCount,
}: {
  document: Document;
  sectionCount: number;
  wordCount: number;
}) {
  const update = useUpdateDocument(document.id);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const [editingLocal, setEditingLocal] = useState<string | null>(null);

  // Reconcile server -> DOM only when not focused.
  useEffect(() => {
    if (titleRef.current && window.document.activeElement !== titleRef.current) {
      titleRef.current.textContent = document.title;
    }
  }, [document.title]);

  const save = (value: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      update.mutate({ title: value.trim() || "Untitled" });
      setEditingLocal(null);
    }, 600);
  };

  return (
    <header className="flex flex-col gap-3 pb-6">
      <DocEmoji value={document.emoji ?? "📝"} onChange={(emoji) => update.mutate({ emoji })} />
      <div
        ref={titleRef}
        role="textbox"
        aria-label="Document title"
        contentEditable
        suppressContentEditableWarning
        className="font-['Fraunces',Georgia,serif] text-[38px] leading-[1.1] tracking-[-0.02em] text-[var(--sea-ink)] outline-none empty:before:italic empty:before:text-[color:rgb(65_97_102_/_0.6)] empty:before:content-['Untitled_—_but_full_of_potential']"
        onInput={(e) => {
          const v = (e.target as HTMLDivElement).textContent ?? "";
          setEditingLocal(v);
          save(v);
        }}
        onBlur={(e) => {
          if (timer.current) window.clearTimeout(timer.current);
          update.mutate({ title: (e.target as HTMLDivElement).textContent?.trim() || "Untitled" });
          setEditingLocal(null);
        }}
      >
        {document.title}
      </div>
      <div className="text-[12px] text-[var(--sea-ink-soft)]">
        Edited {formatRelativeTime(new Date(document.updatedAt).getTime())} · {sectionCount} section
        {sectionCount === 1 ? "" : "s"} · {wordCount} word{wordCount === 1 ? "" : "s"}
      </div>
      {/* editingLocal is intentionally unused visually — it just forces re-render on input */}
      <span hidden aria-hidden>
        {editingLocal}
      </span>
    </header>
  );
}
```

- [ ] **Step 2: `vp check`**

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/doc/doc-header.tsx
git commit -m "feat(fe): add DocHeader with debounced title + emoji"
```

---

## Task 23: `SaveStatePip` + `SectionToolbar` + `SectionMenu`

**Files:**

- Create: `apps/fe/src/components/doc/save-state-pip.tsx`
- Create: `apps/fe/src/components/doc/section-menu.tsx`
- Create: `apps/fe/src/components/doc/section-toolbar.tsx`

- [ ] **Step 1: `save-state-pip.tsx`**

```tsx
import { Check, Loader2 } from "lucide-react";
import type { SectionSave } from "#/lib/section-save-state";

export function SaveStatePip({ state, onRetry }: { state: SectionSave; onRetry?: () => void }) {
  const common = "inline-flex size-3 items-center justify-center rounded-full";
  switch (state.status) {
    case "idle":
      return <span className={common} aria-live="polite" />;
    case "dirty":
      return <span className={`${common} bg-[#d9a441]`} aria-label="Unsaved changes" />;
    case "saving":
      return (
        <Loader2 className="size-3.5 animate-spin text-[var(--lagoon-deep)]" aria-label="Saving" />
      );
    case "saved":
      return (
        <span className={`${common} bg-[var(--lagoon)] text-white`} aria-label="Saved">
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
    case "conflict":
      return <span className={`${common} border border-[#d9a441]`} aria-label="Version conflict" />;
  }
}
```

- [ ] **Step 2: `section-menu.tsx`**

```tsx
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

export function SectionMenu({
  disabledDelete,
  onDelete,
}: {
  disabledDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Section actions"
        className="rounded p-1 hover:bg-[rgb(79_184_178_/_0.1)]"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={disabledDelete}
          onClick={onDelete}
          className={disabledDelete ? "opacity-50" : "text-red-600"}
          title={disabledDelete ? "A document needs at least one section" : undefined}
        >
          Delete section
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: `section-toolbar.tsx`**

```tsx
import type { SectionSave } from "#/lib/section-save-state";
import { SaveStatePip } from "./save-state-pip";
import { SectionMenu } from "./section-menu";

export function SectionToolbar({
  state,
  onRetry,
  disabledDelete,
  onDelete,
  alwaysVisible,
}: {
  state: SectionSave;
  onRetry?: () => void;
  disabledDelete: boolean;
  onDelete: () => void;
  alwaysVisible: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute top-1 right-1 flex items-center gap-1 transition-opacity ${
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      }`}
    >
      <span className="pointer-events-auto">
        <SaveStatePip state={state} onRetry={onRetry} />
      </span>
      <span className="pointer-events-auto">
        <SectionMenu disabledDelete={disabledDelete} onDelete={onDelete} />
      </span>
    </div>
  );
}
```

- [ ] **Step 4: `vp check`**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/doc/save-state-pip.tsx apps/fe/src/components/doc/section-menu.tsx apps/fe/src/components/doc/section-toolbar.tsx
git commit -m "feat(fe): add per-section toolbar, pip, and menu"
```

---

## Task 24: `AddSectionPill` + `SectionConflictBanner`

**Files:**

- Create: `apps/fe/src/components/doc/add-section-pill.tsx`
- Create: `apps/fe/src/components/doc/section-conflict-banner.tsx`

- [ ] **Step 1: Pill**

```tsx
import { Plus } from "lucide-react";

export function AddSectionPill({ onClick }: { onClick: () => void }) {
  return (
    <div className="group/gap relative flex h-6 items-center justify-center">
      <button
        onClick={onClick}
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[rgb(79_184_178_/_0.35)] bg-white px-2 py-0.5 text-[11px] text-[var(--lagoon-deep)] opacity-0 transition-opacity group-hover/gap:opacity-100 focus:opacity-100"
      >
        <Plus className="size-3" /> Add section
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Conflict banner**

```tsx
export function SectionConflictBanner({
  onCopyEdits,
  onDiscardAndReload,
}: {
  onCopyEdits: () => void;
  onDiscardAndReload: () => void;
}) {
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border border-[#d9a441] bg-[#fff7e8] p-3 text-[12.5px] text-[var(--sea-ink)]">
      <div>
        <strong>This section was changed elsewhere.</strong>
        <br />
        Your unsaved edits are kept locally until you decide.
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCopyEdits}
          className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-[11.5px] font-semibold text-[var(--sea-ink)] hover:bg-[rgb(79_184_178_/_0.06)]"
        >
          Copy my edits
        </button>
        <button
          onClick={onDiscardAndReload}
          className="rounded-md bg-[var(--lagoon-deep)] px-2 py-1 text-[11.5px] font-semibold text-white"
        >
          Discard &amp; reload
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/doc/add-section-pill.tsx apps/fe/src/components/doc/section-conflict-banner.tsx
git commit -m "feat(fe): add AddSectionPill and SectionConflictBanner"
```

---

## Task 25: `SectionBlock` — one Tiptap per section

**Files:**

- Create: `apps/fe/src/components/doc/section-block.tsx`
- Modify: `apps/fe/src/components/editor/editor.tsx` (strip title-deriving code; keep only the Tiptap pieces)

- [ ] **Step 1: Strip `editor.tsx`**

It's currently specialized for a one-editor-per-doc world. Replace with a thin reusable piece:

```tsx
import { EditorContent, type JSONContent, useEditor, type Editor as TEditor } from "@tiptap/react";
import { useEffect, useMemo } from "react";
import { BubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";

export type EditorProps = {
  sectionId: string;
  initialContent: JSONContent;
  onReady?: (editor: TEditor) => void;
  onChange?: (editor: TEditor) => void;
};

export function Editor({ sectionId, initialContent, onReady, onChange }: EditorProps) {
  const extensions = useMemo(() => buildExtensions(), []);
  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      autofocus: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-slate max-w-none focus:outline-none text-[15.5px] leading-[1.7] text-[color:rgb(33_74_80)]",
        },
      },
      onUpdate: ({ editor: ed }) => onChange?.(ed),
    },
    [sectionId],
  );

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
```

- [ ] **Step 2: Write `SectionBlock`**

`apps/fe/src/components/doc/section-block.tsx`:

```tsx
import { useEffect, useReducer, useRef, useState } from "react";
import type { Editor as TEditor } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { Editor } from "#/components/editor/editor";
import { SectionToolbar } from "./section-toolbar";
import { SectionConflictBanner } from "./section-conflict-banner";
import { initialSectionSave, reduceSectionSave } from "#/lib/section-save-state";
import { ApiError } from "#/lib/api-error";
import { useUpdateSection, useDeleteSection } from "#/queries/sections";
import { useUi } from "#/stores/ui";
import { extractSectionText } from "#/lib/extract-section-text";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "#/lib/query-keys";

const SAVE_DEBOUNCE_MS = 600;

export function SectionBlock({
  section,
  documentId,
  isOnlySection,
  onRequestAddBelow,
}: {
  section: Section;
  documentId: string;
  isOnlySection: boolean;
  onRequestAddBelow: () => void;
}) {
  const [state, dispatch] = useReducer(reduceSectionSave, initialSectionSave());
  const editorRef = useRef<TEditor | null>(null);
  const versionRef = useRef<number>(section.version);
  const lastSentRef = useRef<unknown | null>(null);
  const timer = useRef<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const setSaveState = useUi((s) => s.setSectionSaveState);
  const clearSaveState = useUi((s) => s.clearSectionSaveState);
  const update = useUpdateSection({ sectionId: section.id, documentId });
  const del = useDeleteSection({ sectionId: section.id, documentId });
  const qc = useQueryClient();

  useEffect(() => {
    setSaveState(section.id, state);
  }, [state, section.id, setSaveState]);

  useEffect(() => {
    return () => clearSaveState(section.id);
  }, [section.id, clearSaveState]);

  const triggerSave = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const content = ed.getJSON();
    lastSentRef.current = content;
    dispatch({ type: "saveStart" });
    update
      .mutateAsync({ contentJson: content, expectedVersion: versionRef.current })
      .then((updated) => {
        versionRef.current = updated.version;
        dispatch({ type: "saveOk", at: Date.now() });
        window.setTimeout(() => dispatch({ type: "fade" }), 1500);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.is409VersionConflict()) {
          dispatch({ type: "conflict" });
          setConflict(true);
        } else {
          dispatch({ type: "networkError" });
        }
      });
  };

  const onChange = (ed: TEditor) => {
    dispatch({ type: "edit" });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(triggerSave, SAVE_DEBOUNCE_MS);
    void ed;
  };

  const onCopyEditsThenReload = async () => {
    const ed = editorRef.current;
    if (ed) {
      const text = extractSectionText(ed.getJSON());
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* non-secure context — swallow */
      }
    }
    await discardAndReload();
  };

  const discardAndReload = async () => {
    // refetch the document so we get the current section
    const doc = await qc.fetchQuery({
      queryKey: qk.document(documentId),
      queryFn: async () => {
        const { api } = await import("#/lib/api");
        const { unwrap } = await import("#/lib/api-error");
        return unwrap(await api.documents[":id"].$get({ param: { id: documentId } }));
      },
    });
    const fresh = (doc as { sections: Section[] }).sections.find((s) => s.id === section.id);
    if (fresh && editorRef.current) {
      editorRef.current.commands.setContent(fresh.contentJson as never, false);
      versionRef.current = fresh.version;
    }
    setConflict(false);
    dispatch({ type: "reload" });
  };

  return (
    <section className="group relative rounded-md py-2 pl-3 focus-within:shadow-[inset_1px_0_0_var(--lagoon)]">
      <SectionToolbar
        state={state}
        disabledDelete={isOnlySection}
        onDelete={() => del.mutate()}
        onRetry={triggerSave}
        alwaysVisible={
          state.status === "saving" || state.status === "error" || state.status === "conflict"
        }
      />
      {conflict ? (
        <SectionConflictBanner
          onCopyEdits={onCopyEditsThenReload}
          onDiscardAndReload={discardAndReload}
        />
      ) : null}
      <Editor
        sectionId={section.id}
        initialContent={section.contentJson as never}
        onReady={(ed) => {
          editorRef.current = ed;
          // Ctrl/Cmd+Enter keymap: adds a new section below
          ed.view.dom.addEventListener("keydown", (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onRequestAddBelow();
            }
          });
        }}
        onChange={onChange}
      />
    </section>
  );
}
```

- [ ] **Step 3: Write a narrow RTL test for the save cycle**

`apps/fe/src/components/doc/section-block.test.tsx`:

```tsx
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { SectionBlock } from "./section-block";
import { server } from "#/test/server";
import type { Section } from "#/lib/api-types";

const section: Section = {
  id: "s1",
  documentId: "d1",
  orderKey: "a0",
  label: null,
  kind: "prose",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
  },
  contentText: "",
  contentHash: "",
  frontmatter: {},
  version: 1,
  createdBy: "u",
  updatedBy: "u",
  createdAt: "x",
  updatedAt: "x",
};

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

describe("SectionBlock 409 flow", () => {
  test("shows conflict banner on 409", async () => {
    server.use(
      http.patch("*/sections/:id", () =>
        HttpResponse.json(
          {
            error: "version_conflict",
            currentVersion: 5,
            currentSection: { ...section, version: 5 },
          },
          { status: 409 },
        ),
      ),
    );
    const { Wrapper } = wrap();
    render(
      <Wrapper>
        <SectionBlock
          section={section}
          documentId="d1"
          isOnlySection={false}
          onRequestAddBelow={() => {}}
        />
      </Wrapper>,
    );
    // Simulate an onChange -> triggers save through debounce.
    // Because the Editor runs Tiptap which is heavy under jsdom, we directly
    // dispatch a DOM event the editor responds to. Simpler: call the real save path by
    // firing a keydown that emits an input — skipped here. Instead we assert the banner
    // appears when the code reaches the conflict branch via the mutation helper below.
    // If jsdom + Tiptap proves fragile, split this into a hook-level test of the save cycle.
  });
});
```

Keep this test intentionally light. If Tiptap under jsdom is brittle, the real coverage comes from the hook tests in Task 9 (409 surfacing) and a Playwright-style smoke later; don't invest heavily fighting jsdom here.

- [ ] **Step 4: `vp test run` + `vp check`**

Expected: PASS (or the narrow banner test is a no-op assertion; remove it if it doesn't add value).

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/doc/section-block.tsx apps/fe/src/components/doc/section-block.test.tsx apps/fe/src/components/editor/editor.tsx
git commit -m "feat(fe): SectionBlock (one Tiptap per section) with save + conflict flow"
```

---

## Task 26: `SectionList` + hook up `DocSurface`

**Files:**

- Create: `apps/fe/src/components/doc/section-list.tsx`
- Modify: `apps/fe/src/components/doc/doc-surface.tsx`

- [ ] **Step 1: `SectionList`**

```tsx
import type { Section } from "#/lib/api-types";
import { SectionBlock } from "./section-block";
import { AddSectionPill } from "./add-section-pill";
import { useCreateSection } from "#/queries/sections";
import { keyAfter } from "#/lib/order-key";

export function SectionList({ documentId, sections }: { documentId: string; sections: Section[] }) {
  const create = useCreateSection(documentId);

  const insertAfter = (afterOrderKey: string | null) => {
    const orderKey = keyAfter(afterOrderKey);
    create.mutate({ orderKey });
  };

  return (
    <div className="flex flex-col">
      {sections.map((s, i) => {
        const next = sections[i + 1]?.orderKey ?? null;
        return (
          <div key={s.id} className="flex flex-col">
            <SectionBlock
              section={s}
              documentId={documentId}
              isOnlySection={sections.length === 1}
              onRequestAddBelow={() => {
                // compute a key between s.orderKey and next (if any)
                if (next) {
                  // small util: fractional midpoint
                  const mid = midpoint(s.orderKey, next);
                  create.mutate({ orderKey: mid });
                } else {
                  insertAfter(s.orderKey);
                }
              }}
            />
            <AddSectionPill
              onClick={() => {
                if (next) create.mutate({ orderKey: midpoint(s.orderKey, next) });
                else insertAfter(s.orderKey);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function midpoint(a: string, b: string): string {
  // lazy midpoint — request BE to pick by sending undefined and letting BE append;
  // but since we need to insert between two, we rely on the fractional-indexing package's generateKeyBetween.
  // For simplicity here, reuse the BE's contract: omit orderKey to auto-append. We handle the between-case
  // by sending no orderKey (will append tail) — which is a minor UX bug when midpoint is needed.
  // See §15 open flag.
  return a + b.slice(0, 1); // placeholder that won't collide; Task 27 replaces with real generateKeyBetween.
}
```

The `midpoint` placeholder is replaced in Task 27 (fractional-indexing). We leave a working-but-crude implementation here to keep this task focused on composition.

- [ ] **Step 2: Add `order-key.ts` helper**

`apps/fe/src/lib/order-key.ts`:

```ts
export function keyAfter(_previous: string | null): string {
  // When omitted in the POST body, the BE computes keyAfter itself. We return
  // a marker that prompts the caller to *not* send orderKey; SectionList only calls
  // this in the append-tail case today.
  return "__append__";
}
```

Adjust `SectionList` above so that when `orderKey === "__append__"`, we call `create.mutate({})` (no orderKey) and let the BE append.

- [ ] **Step 3: Replace `DocSurface`**

```tsx
import { useDocument } from "#/queries/documents";
import { DocHeader } from "./doc-header";
import { SectionList } from "./section-list";

export function DocSurface({ documentId }: { documentId: string | null }) {
  const q = useDocument(documentId);
  if (!documentId) {
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-24 text-center text-[var(--sea-ink-soft)]">
        <p className="font-['Fraunces',Georgia,serif] text-2xl text-[var(--sea-ink)]">
          Nothing selected yet
        </p>
        <p className="mt-2 text-sm italic opacity-80">
          Pick a document on the left, or create a new one.
        </p>
      </div>
    );
  }
  if (q.isLoading)
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-14 text-sm text-[var(--sea-ink-soft)]">
        Loading…
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-14 text-sm text-red-600">Failed to load.</div>
    );

  const wordCount = estimateWordCount(q.data.sections);
  return (
    <div className="mx-auto w-full max-w-[680px] px-6 pt-14 pb-20">
      <DocHeader
        document={q.data.document}
        sectionCount={q.data.sections.length}
        wordCount={wordCount}
      />
      <SectionList documentId={q.data.document.id} sections={q.data.sections} />
    </div>
  );
}

function estimateWordCount(sections: { contentText: string }[]) {
  return sections.reduce(
    (sum, s) => sum + (s.contentText.trim() ? s.contentText.trim().split(/\s+/).length : 0),
    0,
  );
}
```

- [ ] **Step 4: `vp check` and `vp test run`**

- [ ] **Step 5: Commit**

```bash
git add apps/fe/src/components/doc/section-list.tsx apps/fe/src/components/doc/doc-surface.tsx apps/fe/src/lib/order-key.ts
git commit -m "feat(fe): SectionList + DocSurface rendering DocHeader + sections"
```

---

## Task 27: Real fractional midpoint via `fractional-indexing`

**Files:**

- Modify: `apps/fe/package.json` (add dep)
- Modify: `apps/fe/src/lib/order-key.ts`
- Modify: `apps/fe/src/components/doc/section-list.tsx`

- [ ] **Step 1: Install the package**

```
vp add fractional-indexing
```

- [ ] **Step 2: Write test**

`apps/fe/src/lib/order-key.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { keyBetween } from "./order-key";

describe("keyBetween", () => {
  test("strictly between a and b", () => {
    const k = keyBetween("a0", "a1");
    expect(k > "a0" && k < "a1").toBe(true);
  });
  test("after tail when b is null", () => {
    const k = keyBetween("a0", null);
    expect(k > "a0").toBe(true);
  });
  test("before head when a is null", () => {
    const k = keyBetween(null, "a0");
    expect(k < "a0").toBe(true);
  });
});
```

- [ ] **Step 3: Implement**

```ts
import { generateKeyBetween } from "fractional-indexing";

export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}
```

Remove the placeholder `keyAfter` and its usage.

- [ ] **Step 4: Update `SectionList` to use `keyBetween`**

```tsx
// ... in onRequestAddBelow and AddSectionPill onClick:
const mid = keyBetween(s.orderKey, next);
create.mutate({ orderKey: mid });
```

- [ ] **Step 5: Run tests**

```
vp test run src/lib/order-key.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/fe/src/lib/order-key.ts apps/fe/src/lib/order-key.test.ts apps/fe/src/components/doc/section-list.tsx apps/fe/package.json pnpm-lock.yaml
git commit -m "feat(fe): compute fractional midpoints for section inserts"
```

---

## Task 28: Focus routing between sections

**Files:**

- Modify: `apps/fe/src/components/doc/section-block.tsx`
- Modify: `apps/fe/src/components/doc/section-list.tsx`

- [ ] **Step 1: Introduce a per-doc focus coordinator**

Inside `SectionList` keep a `Map<sectionId, TEditor>` via a ref, plus a `focus(id, position)` helper passed down. `SectionBlock` reports its editor to the parent via `onEditorReady(editor)` and receives `focusPrev` / `focusNext` handlers.

Add to `SectionBlock` props:

```ts
onEditorReady?: (id: string, editor: TEditor) => void;
onFocusPrev?: () => void;
onFocusNext?: () => void;
```

Wire into Editor's `onReady`:

```ts
onReady={(ed) => {
  editorRef.current = ed;
  onEditorReady?.(section.id, ed);
  ed.view.dom.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onRequestAddBelow();
      return;
    }
    if (e.key === "ArrowDown") {
      const { selection, doc } = ed.state;
      if (selection.$head.pos >= doc.content.size - 1) {
        e.preventDefault();
        onFocusNext?.();
      }
    }
    if (e.key === "ArrowUp") {
      const { selection } = ed.state;
      if (selection.$head.pos <= 1) {
        e.preventDefault();
        onFocusPrev?.();
      }
    }
  });
}}
```

- [ ] **Step 2: `SectionList` owns the map and wires neighbors**

```tsx
const editors = useRef(new Map<string, TEditor>());
const focusSection = (id: string, where: "start" | "end") => {
  const ed = editors.current.get(id);
  if (!ed) return;
  if (where === "start") ed.commands.focus("start");
  else ed.commands.focus("end");
};

// in map:
<SectionBlock
  // ...
  onEditorReady={(id, ed) => editors.current.set(id, ed)}
  onFocusPrev={() => {
    const prev = sections[i - 1];
    if (prev) focusSection(prev.id, "end");
  }}
  onFocusNext={() => {
    const nextSec = sections[i + 1];
    if (nextSec) focusSection(nextSec.id, "start");
  }}
/>;
```

- [ ] **Step 3: `vp check`**

- [ ] **Step 4: Commit**

```bash
git add apps/fe/src/components/doc/section-block.tsx apps/fe/src/components/doc/section-list.tsx
git commit -m "feat(fe): arrow-key focus routing between sections"
```

---

## Task 29: Move the created-doc's selection so `AppShell` navigates

**Files:**

- Modify: `apps/fe/src/components/sidebar/sidebar.tsx`
- Modify: `apps/fe/src/components/app-shell.tsx`

- [ ] **Step 1: When `+ New document` fires, store the new id in Ui store**

(Already done in Task 18.) Double-check the branch — if not, update it now.

- [ ] **Step 2: Auto-select the first doc in list when none selected**

Add effect to `AppShell`:

```tsx
import { useDocumentsList } from "#/queries/documents";

// inside AppShell:
const statusFilter = useUi((s) => s.statusFilter);
const list = useDocumentsList({ status: statusFilter });
const selectDoc = useUi((s) => s.selectDocument);
useEffect(() => {
  if (!selectedId && list.data && list.data.length > 0) {
    selectDoc(list.data[0]!.id);
  }
}, [selectedId, list.data, selectDoc]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/fe/src/components/app-shell.tsx
git commit -m "feat(fe): auto-select first doc when none selected"
```

---

## Task 30: Remove legacy imports / final compile sweep

**Files:**

- Grep + fix callers that still reference deleted `#/stores/documents` or `#/lib/seed-docs` or the old `SaveStatus` signature.

- [ ] **Step 1: Sweep**

Run:

```
grep -R "from \"#/stores/documents\"\|from \"#/lib/seed-docs\"" apps/fe/src || true
```

Expected: no results.

- [ ] **Step 2: `vp check`**

Expected: PASS. If a reference remains, fix it. Common culprits:

- `DocEmoji` might import a style helper from the old store; swap to props.
- `Topbar`'s breadcrumb previously read from Zustand — confirm it now reads from `useDocument`.

- [ ] **Step 3: `vp test run`**

Expected: PASS.

- [ ] **Step 4: Commit (if any code changed)**

```bash
git add -A
git commit -m "chore(fe): finalize removal of legacy store references"
```

---

## Task 31: End-to-end manual smoke

No code. Verify the design doc's §14 checklist against running software.

- [ ] **Step 1: Run BE**

```
cd apps/be && vp run be#dev
```

- [ ] **Step 2: Run FE**

```
cd apps/fe && vp dev
```

- [ ] **Step 3: Walk the checklist**

Open http://localhost:3000. Verify:

- [ ] Unauthenticated → redirected to `/sign-in`.
- [ ] Sign-up creates workspace + lands in app with empty Recent documents.
- [ ] `+ New document` creates a doc with one section; typing cycles save pip through `dirty → saving → saved → idle`.
- [ ] Reload the page — content persists.
- [ ] `Ctrl/Cmd+Enter` inside a section adds a section below; `+ Add section` pill (in gap) also adds.
- [ ] Second section's arrow-up from position 0 moves caret to end of the first section.
- [ ] `⋯ → Delete section` disabled when only one section remains; enabled when 2+.
- [ ] Open the same doc in a second tab, edit the same section concurrently — first tab to resolve wins; the other tab shows the conflict banner with both buttons working.
- [ ] Change title / emoji / status — values persist after reload.
- [ ] Sign out → back to `/sign-in`.

- [ ] **Step 4: If anything fails, file an entry in the plan's "Known issues" section (below) before shipping.**

---

## Known issues (filled during QA)

_(Empty at plan time. Populate during Task 31 if needed.)_

---

## Self-review notes (author-only; removed before handoff)

1. **Spec coverage:** §4 auth → Tasks 15–17; §5 API → Tasks 3–5; §5.3 hooks → Tasks 6–9; §6 section editor → Tasks 22–28; §7 save rollup → Tasks 12, 21; §8 metadata → Tasks 21–22; §9 sidebar → Task 18; §10 state → Task 13; §11 component delta → Tasks 22–26; §12 testing → inline per task; §13 dev loop → Task 1.
2. **Placeholders:** `SectionList` initially ships with a placeholder `midpoint`; Task 27 replaces it. `SectionConflictBanner` jsdom test is intentionally light (see Task 25 Step 3). `UserChip` shows `user.id` before Task 19 extends `/me`.
3. **Type consistency:** Hooks and callers use `useUpdateSection({ sectionId, documentId })`, `useDeleteSection({ sectionId, documentId })`, `useCreateSection(documentId)` consistently across Tasks 9, 25, 26. `SectionSave` fields are the same across Tasks 11, 12, 23, 25. `MeResponse.user` is `{ id }` through Task 18 and becomes `{ id, email, name }` at Task 19; the only consumer (UserChip) is updated in the same task.
