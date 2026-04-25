import {
  mergeAttributes,
  Node,
  NodeViewContent,
  type ReactNodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { useState } from "react";
import { EmojiPalette } from "#/components/doc/emoji-palette";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";

function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const [open, setOpen] = useState(false);
  const emoji = (node.attrs as { emoji?: string }).emoji ?? "💡";
  return (
    <NodeViewWrapper
      data-callout
      className="my-3 flex gap-2.5 rounded-md border border-(--rule) bg-(--paper-soft) p-3"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            contentEditable={false}
            className="h-7 rounded-md px-1.5 text-lg leading-none transition select-none hover:bg-(--selection)"
            aria-label="Change callout icon"
          >
            {emoji}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <EmojiPalette
            onPick={(e) => {
              updateAttributes({ emoji: e });
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <NodeViewContent className="flex-1 text-[15px] text-(--ink)" />
    </NodeViewWrapper>
  );
}

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      emoji: { default: "💡" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-callout]",
        getAttrs: (el) => ({
          emoji: (el as HTMLElement).dataset.emoji ?? "💡",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
