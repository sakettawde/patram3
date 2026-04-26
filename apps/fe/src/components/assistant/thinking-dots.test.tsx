import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { ThinkingDots } from "./thinking-dots";

describe("ThinkingDots", () => {
  test("renders the Thinking… label", () => {
    render(<ThinkingDots />);
    expect(screen.getByText("Thinking…")).toBeTruthy();
  });

  test("exposes a status role with aria-label", () => {
    render(<ThinkingDots />);
    const node = screen.getByRole("status", { name: /thinking/i });
    expect(node).toBeTruthy();
  });

  test("renders three pulse dots", () => {
    const { container } = render(<ThinkingDots />);
    const dots = container.querySelectorAll(".thinking-dot");
    expect(dots.length).toBe(3);
  });
});
