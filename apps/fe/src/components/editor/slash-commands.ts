import type { Editor, Range } from "@tiptap/react";

export type SlashCommand = {
  key: string;
  title: string;
  description: string;
  shortcut?: string;
  icon: string;
  run: (editor: Editor, range: Range) => void;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    key: "h1",
    title: "Heading 1",
    description: "Big section title",
    shortcut: "#",
    icon: "H1",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run(),
  },
  {
    key: "h2",
    title: "Heading 2",
    description: "Medium section heading",
    shortcut: "##",
    icon: "H2",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
  },
  {
    key: "h3",
    title: "Heading 3",
    description: "Sub-section",
    shortcut: "###",
    icon: "H3",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
  },
  {
    key: "ul",
    title: "Bulleted list",
    description: "A simple bulleted list",
    shortcut: "-",
    icon: "• ≡",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    key: "ol",
    title: "Numbered list",
    description: "Ordered list",
    shortcut: "1.",
    icon: "1. ≡",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    key: "task",
    title: "Task list",
    description: "Track to-dos with checkboxes",
    shortcut: "[]",
    icon: "☑",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    key: "quote",
    title: "Quote",
    description: "Pull out a line",
    shortcut: ">",
    icon: "”",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    key: "hr",
    title: "Divider",
    description: "A horizontal line",
    icon: "—",
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    key: "code",
    title: "Code block",
    description: "Monospace block of code",
    shortcut: "```",
    icon: "</>",
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    key: "callout",
    title: "Callout",
    description: "Highlight something important",
    icon: "💡",
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertContent({
          type: "callout",
          attrs: { emoji: "💡" },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
  {
    key: "image",
    title: "Image",
    description: "Insert by URL",
    icon: "🖼",
    run: (e, r) => {
      const url = window.prompt("Image URL");
      if (!url) return;
      e.chain().focus().deleteRange(r).setImage({ src: url }).run();
    },
  },
];

export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  const starts: SlashCommand[] = [];
  const contains: SlashCommand[] = [];
  for (const cmd of SLASH_COMMANDS) {
    const label = cmd.title.toLowerCase();
    if (label.startsWith(q)) starts.push(cmd);
    else if (label.includes(q)) contains.push(cmd);
  }
  return [...starts, ...contains];
}
