import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, test } from "vite-plus/test";
import { uiStore } from "#/stores/ui";
import { AppShell } from "./app-shell";

describe("<AppShell />", () => {
  beforeEach(() => {
    localStorage.clear();
    uiStore.setState({ sidebarTab: "docs" });
  });

  test("mounts with brand, search, and new-doc button", () => {
    render(<AppShell />);

    screen.getByText("Patram");
    screen.getByLabelText(/search documents/i);
    screen.getByRole("button", { name: /new document/i });
  });

  test("shows seeded documents in the sidebar", () => {
    render(<AppShell />);
    screen.getByText("Onboarding notes");
    screen.getByText("Product principles");
  });

  test("switching to Sessions tab shows the New chat button", () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    screen.getByRole("button", { name: /new chat/i });
  });
});
