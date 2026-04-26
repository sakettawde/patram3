import { describe, expect, test } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityStrip } from "./activity-strip";

const items = [
  { id: "a1", kind: "thinking" as const, label: "Thinking…", at: 1 },
  { id: "a2", kind: "tool_use" as const, label: "Searched the web", at: 2 },
];

describe("ActivityStrip", () => {
  test("collapsed shows only latest label", () => {
    render(<ActivityStrip items={items} />);
    expect(screen.getByText("Searched the web")).toBeTruthy();
    expect(screen.queryByText("Thinking…")).toBeNull();
  });

  test("expands on click", async () => {
    render(<ActivityStrip items={items} />);
    await userEvent.click(screen.getByRole("button", { name: /show steps/i }));
    expect(screen.getByText("Thinking…")).toBeTruthy();
  });

  test("renders nothing when empty", () => {
    const { container } = render(<ActivityStrip items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
