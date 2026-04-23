import { describe, expect, test } from "vite-plus/test";
import { createDocumentsStore } from "./documents";

describe("DocumentsStore", () => {
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
