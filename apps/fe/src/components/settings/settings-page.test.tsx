import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { SettingsPage } from "./settings-page";

describe("<SettingsPage />", () => {
  test("renders the title and section header", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Configuration" })).toBeTruthy();
    expect(screen.getByText("Integrations")).toBeTruthy();
  });

  test("renders one row with a Connect button per mock integration", () => {
    render(<SettingsPage />);
    for (const name of ["Slack", "Linear", "Gmail", "Notion", "GitHub", "Google Drive", "Jira"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    const connectButtons = screen.getAllByRole("button", { name: /connect/i });
    expect(connectButtons.length).toBe(7);
  });
});
