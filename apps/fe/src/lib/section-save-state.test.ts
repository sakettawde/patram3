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
