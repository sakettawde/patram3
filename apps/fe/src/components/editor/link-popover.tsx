import type { Editor } from "@tiptap/react";
import { Link as LinkIcon } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";

export function LinkPopover({ editor }: { editor: Editor }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-(--sea-ink-soft) transition-colors hover:bg-[rgb(79_184_178/0.14)] hover:text-(--sea-ink)"
        >
          <LinkIcon className="size-3" /> Link
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() === "") {
              editor.chain().focus().unsetLink().run();
            } else {
              editor.chain().focus().setLink({ href: url.trim() }).run();
            }
            setUrl("");
            setOpen(false);
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--lagoon-deep)]"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--lagoon-deep)] px-2 py-1 text-xs font-semibold text-white"
          >
            Set
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
