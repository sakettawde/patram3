import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createUiStore } from "./ui";

describe("UiStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("defaults to docs tab", () => {
    const s = createUiStore();
    expect(s.getState().sidebarTab).toBe("docs");
  });

  test("setSidebarTab switches", () => {
    const s = createUiStore();
    s.getState().setSidebarTab("sessions");
    expect(s.getState().sidebarTab).toBe("sessions");
  });

  test("persists across instances via localStorage", () => {
    const a = createUiStore();
    a.getState().setSidebarTab("sessions");
    const b = createUiStore();
    expect(b.getState().sidebarTab).toBe("sessions");
  });
});
