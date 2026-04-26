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

import { uiStore } from "./ui";

test("setSaving toggles the saving flag", () => {
  uiStore.setState({ saving: false });
  uiStore.getState().setSaving(true);
  expect(uiStore.getState().saving).toBe(true);
  uiStore.getState().setSaving(false);
  expect(uiStore.getState().saving).toBe(false);
});

test("saving is not persisted across reloads", () => {
  uiStore.getState().setSaving(true);
  // partialize must not include `saving`.
  const persisted = JSON.parse(localStorage.getItem("patram.ui.v1") ?? "{}");
  expect(persisted.state?.saving).toBeUndefined();
});
