import { expect, test } from "vite-plus/test";
import { markdownToHtml } from "./markdown-to-html";

test("renders heading", () => {
  expect(markdownToHtml("# Title")).toContain("<h1>Title</h1>");
});

test("renders paragraph with bold", () => {
  expect(markdownToHtml("Hello **world**")).toMatch(/<p>Hello <strong>world<\/strong><\/p>/);
});

test("renders bullet list", () => {
  const html = markdownToHtml("- a\n- b");
  expect(html).toMatch(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
});

test("renders code block", () => {
  expect(markdownToHtml("```ts\nconst x = 1;\n```")).toContain("<code");
});

test("strips a leading HTML comment id marker", () => {
  expect(markdownToHtml("<!-- id:abc -->\n# Title")).toContain("<h1>Title</h1>");
});
