import { expect, test } from "vite-plus/test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "./unique-id";

function makeEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), UniqueID],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    },
  });
}

test("stamps ids on existing block nodes", () => {
  const editor = makeEditor();
  const json = editor.getJSON();
  const para = json.content?.[0];
  expect(para?.attrs?.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
  editor.destroy();
});

test("stamps ids on newly inserted blocks", () => {
  const editor = makeEditor();
  editor.commands.insertContent({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "h" }],
  });
  const json = editor.getJSON();
  const ids = (json.content ?? []).map((n) => n.attrs?.id);
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8}$/);
  expect(new Set(ids).size).toBe(ids.length);
  editor.destroy();
});

test("preserves existing ids on round-trip", () => {
  const editor = makeEditor();
  const before = editor.getJSON();
  editor.commands.setContent(before);
  const after = editor.getJSON();
  expect(after.content?.[0]?.attrs?.id).toBe(before.content?.[0]?.attrs?.id);
  editor.destroy();
});
