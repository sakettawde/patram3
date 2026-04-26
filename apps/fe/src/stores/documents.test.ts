import { describe, expect, test } from "vite-plus/test";
import { createDocumentsStore } from "./documents";

describe("DocumentsUiStore", () => {
  test("starts with no selection", () => {
    const s = createDocumentsStore();
    expect(s.getState().selectedId).toBeNull();
  });

  test("selectDoc updates selectedId", () => {
    const s = createDocumentsStore();
    s.getState().selectDoc("d1");
    expect(s.getState().selectedId).toBe("d1");
    s.getState().selectDoc(null);
    expect(s.getState().selectedId).toBeNull();
  });
});
