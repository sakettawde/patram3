import { describe, expect, test } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  test("renders inline code", () => {
    render(<Markdown source="use `foo()` here" />);
    expect(screen.getByText("foo()").tagName).toBe("CODE");
  });

  test("renders fenced code block with copy button", () => {
    render(<Markdown source={"```ts\nlet x=1;\n```"} />);
    expect(screen.getByText(/let x=1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  test("renders link with safe target+rel", () => {
    render(<Markdown source="[a](https://example.com)" />);
    const a = screen.getByRole("link") as HTMLAnchorElement;
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
  });
});
