import { describe, expect, test } from "vite-plus/test";
import { extractSectionText } from "./extract-section-text";

describe("extractSectionText", () => {
  test("empty doc", () => {
    expect(extractSectionText({ type: "doc", content: [] })).toBe("");
  });

  test("paragraphs separated by \\n\\n", () => {
    expect(
      extractSectionText({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
          { type: "paragraph", content: [{ type: "text", text: "There" }] },
        ],
      }),
    ).toBe("Hi\n\nThere");
  });

  test("list items separated by single newline", () => {
    expect(
      extractSectionText({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }],
              },
            ],
          },
        ],
      }),
    ).toBe("a\nb");
  });

  test("hardBreak emits \\n", () => {
    expect(
      extractSectionText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "a" },
              { type: "hardBreak" },
              { type: "text", text: "b" },
            ],
          },
        ],
      }),
    ).toBe("a\nb");
  });
});
