import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { SkillsPage } from "./skills-page";

describe("<SkillsPage />", () => {
  test("renders the title and the header 'Add skill' button", () => {
    render(<SkillsPage />);
    expect(screen.getByRole("heading", { name: "Skills" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /add skill/i })).toBeTruthy();
  });

  test("renders all eight mock skills", () => {
    render(<SkillsPage />);
    for (const name of [
      "Web search",
      "Code interpreter",
      "Image generation",
      "Calendar lookup",
      "PDF parser",
      "SQL query",
      "Calculator",
      "Translate",
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  test("renders the dashed '+ Add skill' placeholder card at the end of the grid", () => {
    render(<SkillsPage />);
    // The header button and the placeholder card both contain "Add skill" text.
    // Both should be present.
    const matches = screen.getAllByText(/add skill/i);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
