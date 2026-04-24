import { describe, expect, test } from "vite-plus/test";
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
