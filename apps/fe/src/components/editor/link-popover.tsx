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
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/90 hover:bg-white/10"
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
            className="flex-1 rounded-md border border-(--rule) bg-white px-2 py-1 text-xs outline-none focus:border-(--rule-strong)"
          />
          <button
            type="submit"
            className="rounded-md bg-(--ink) px-2 py-1 text-xs font-medium text-(--paper)"
          >
            Set
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
