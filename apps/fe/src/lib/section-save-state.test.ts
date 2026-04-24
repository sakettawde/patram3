import { describe, expect, test } from "vite-plus/test";
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
