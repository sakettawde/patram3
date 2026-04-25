import { render, screen } from "@testing-library/react";
import { describe, test } from "vite-plus/test";
import { AppShell } from "./app-shell";

describe("<AppShell />", () => {
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
});
