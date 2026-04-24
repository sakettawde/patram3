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
