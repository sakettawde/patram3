import type { Editor } from "@tiptap/react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

export function TurnIntoMenu({ editor }: { editor: Editor }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // Preserve the ProseMirror selection; without this the editor blurs,
          // the bubble menu unmounts, and Radix has no trigger to anchor against —
          // the content ends up in the top-left of the viewport.
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-(--sea-ink-soft) transition-colors hover:bg-[rgb(79_184_178/0.14)] hover:text-(--sea-ink)"
        >
          Turn into
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-44">
        <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
          Paragraph
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          Heading 1
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          Heading 2
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          Heading 3
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleBlockquote().run()}>
          Quote
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
