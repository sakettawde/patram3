import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { uiStore } from "#/stores/ui";
import { SidebarTabs } from "./sidebar-tabs";

describe("<SidebarTabs />", () => {
  beforeEach(() => {
    localStorage.clear();
    uiStore.setState({ sidebarTab: "docs" });
  });

  test("renders both tabs and marks the active one", () => {
    render(<SidebarTabs />);
    const docs = screen.getByRole("button", { name: "Docs" });
    const sessions = screen.getByRole("button", { name: "Sessions" });
    expect(docs.getAttribute("aria-pressed")).toBe("true");
    expect(sessions.getAttribute("aria-pressed")).toBe("false");
  });

  test("clicking sessions switches active tab", async () => {
    const user = userEvent.setup();
    render(<SidebarTabs />);
    await user.click(screen.getByRole("button", { name: "Sessions" }));
    expect(uiStore.getState().sidebarTab).toBe("sessions");
  });
});
