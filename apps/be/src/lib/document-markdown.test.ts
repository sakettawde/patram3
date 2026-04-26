import { describe, expect, test } from "vite-plus/test";
import { documentJsonToMarkdown } from "./document-markdown";

describe("documentJsonToMarkdown", () => {
  test("renders heading + paragraph with id comments", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, id: "h1" },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [{ type: "text", text: "Hello world." }],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toBe(
      ["<!-- id:h1 -->", "# Title", "", "<!-- id:p1 -->", "Hello world.", ""].join("\n"),
    );
  });

  test("renders bullet list as a single block", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          attrs: { id: "ul1" },
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }],
            },
          ],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toBe(["<!-- id:ul1 -->", "- one", "- two", ""].join("\n"));
  });

  test("renders code block", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { id: "c1", language: "ts" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toBe(
      ["<!-- id:c1 -->", "```ts", "const x = 1;", "```", ""].join("\n"),
    );
  });

  test("renders inline marks (bold, italic, code, link)", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [
            { type: "text", text: "a " },
            { type: "text", marks: [{ type: "bold" }], text: "b" },
            { type: "text", text: " c " },
            { type: "text", marks: [{ type: "italic" }], text: "d" },
            { type: "text", text: " e " },
            { type: "text", marks: [{ type: "code" }], text: "f" },
            { type: "text", text: " " },
            { type: "text", marks: [{ type: "link", attrs: { href: "https://x" } }], text: "g" },
          ],
        },
      ],
    };
    expect(documentJsonToMarkdown(json)).toContain("a **b** c *d* e `f` [g](https://x)");
  });

  test("stamps a placeholder id when a block is missing one", () => {
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "no id" }] }],
    };
    const out = documentJsonToMarkdown(json);
    expect(out).toMatch(/^<!-- id:[A-Za-z0-9_-]{8} -->\nno id\n$/);
  });
});
