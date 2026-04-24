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
      <div
        className="patram-bubble flex items-center gap-0.5 rounded-full border border-(--line) bg-[rgba(251,255,248,0.94)] px-1 py-1 text-[12.5px] text-(--sea-ink) shadow-[0_14px_34px_rgba(23,58,64,0.14),0_2px_8px_rgba(23,58,64,0.06)] backdrop-blur-md"
        onMouseDown={(e) => {
          // Keep ProseMirror selection alive when clicking toolbar UI.
          // Without this, the editor blurs, the bubble menu unmounts, and
          // Radix sub-dropdowns (Turn into) render without a valid anchor.
          e.preventDefault();
        }}
      >
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
      className={cn(
        "flex size-7 items-center justify-center rounded-full text-(--sea-ink-soft) transition-colors hover:bg-[rgb(79_184_178/0.14)] hover:text-(--sea-ink)",
        active && "bg-[rgb(79_184_178/0.22)] text-(--lagoon-deep)",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div aria-hidden className="mx-0.5 h-4 w-px bg-(--line)" />;
}
