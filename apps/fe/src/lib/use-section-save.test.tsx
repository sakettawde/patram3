import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
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
      () =>
        useSectionSave({
          section: baseSection(),
          documentId: "d1",
          editor: null as unknown as TEditor | null,
        }),
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
          editor: null as unknown as TEditor | null,
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
          editor: null as unknown as TEditor | null,
        }),
      { wrapper: Wrapper },
    );
    expect(result.current.initialContent).toEqual(serverDoc);
    expect(window.localStorage.getItem("patram:section:s1")).toBeNull();
  });
});
