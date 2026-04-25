import { type Editor } from "@tiptap/react";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Strikethrough,
  Underline as UnderlineIc,
} from "lucide-react";
import { cn } from "#/lib/utils";
import { LinkPopover } from "./link-popover";
import { TurnIntoMenu } from "./turn-into-menu";

export function BubbleMenu({ editor }: { editor: Editor }) {
  return (
    <TiptapBubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) => {
        if (!ed.isEditable) return false;
        return from !== to;
      }}
    >
      <div className="flex items-center gap-0.5 rounded-md bg-(--ink) p-1 text-xs text-white shadow-[0_8px_20px_rgba(17,17,17,0.18)]">
        <Btn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
        >
          <UnderlineIc className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Strikethrough"
        >
          <Strikethrough className="size-3.5" />
        </Btn>
        <Sep />
        <Btn
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          aria-label="Inline code"
        >
          <Code className="size-3.5" />
        </Btn>
        <Btn
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          aria-label="Highlight"
        >
          <Highlighter className="size-3.5" />
        </Btn>
        <Sep />
        <LinkPopover editor={editor} />
        <TurnIntoMenu editor={editor} />
      </div>
    </TiptapBubbleMenu>
  );
}

function Btn({
  children,
  onClick,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn("rounded px-2 py-1 hover:bg-white/10", active && "bg-white/15 text-white")}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div aria-hidden className="mx-0.5 my-1 w-px bg-white/15" />;
}
