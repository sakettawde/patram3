import { render, screen, within } from "@testing-library/react";
import { describe, test } from "vite-plus/test";
import { AppShell } from "./app-shell";

describe("<AppShell />", () => {
  test("mounts with brand, search, new-doc button, and breadcrumb", () => {
    render(<AppShell />);

    // Sidebar chrome (getByText / getByRole throw on miss).
    screen.getByText("Patram");
    screen.getByText(/search documents/i);
    screen.getByRole("button", { name: /new document/i });

    // Breadcrumb for the initially selected seed doc.
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    within(nav).getByText("All documents");
  });

  test("shows seeded documents in the sidebar", () => {
    render(<AppShell />);
    screen.getByText("Onboarding notes");
    screen.getByText("Product principles");
  });
});
