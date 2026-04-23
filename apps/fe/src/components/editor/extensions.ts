import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CalloutNode } from "./callout-node";
import { SlashCommandsExtension } from "./slash-extension";

export function buildExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Placeholder.configure({
      placeholder: ({ node, pos }) => {
        if (node.type.name === "heading" && node.attrs.level === 1 && pos === 0) {
          return "Untitled — but full of potential";
        }
        if (node.type.name === "paragraph") {
          return "Press / to conjure a block, or just start writing.";
        }
        return "";
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: false }),
    Image,
    CharacterCount,
    CalloutNode,
    SlashCommandsExtension,
  ];
}
