import { describe, expect, it } from "vite-plus/test";
import { extractText } from "./extract-text";

describe("extractText", () => {
  it("returns empty string for an empty doc", () => {
    expect(extractText({ type: "doc", content: [] })).toBe("");
  });

  it("extracts paragraph text", () => {
    expect(
      extractText({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
      }),
    ).toBe("hello");
  });

  it("joins blocks with double newline", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "a" }] },
          { type: "paragraph", content: [{ type: "text", text: "b" }] },
        ],
      }),
    ).toBe("a\n\nb");
  });

  it("joins list items with single newline within a list", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "y" }] }],
              },
            ],
          },
        ],
      }),
    ).toBe("x\ny");
  });

  it("handles nested callouts", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          {
            type: "callout",
            attrs: { emoji: "💡" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "idea" }] }],
          },
        ],
      }),
    ).toBe("idea");
  });

  it("handles table cells joined by newline", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "A1" }] }],
                  },
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "A2" }] }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe("A1\nA2");
  });
});
