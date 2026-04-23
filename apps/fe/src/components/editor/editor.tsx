import type { JSONContent } from "@tiptap/react";

export type EditorProps = {
  docId: string;
  initialContent: JSONContent;
  onUpdate: (args: { json: JSONContent; wordCount: number; title: string }) => void;
  onSavingChange: (saving: boolean) => void;
};

export function Editor(_: EditorProps) {
  return (
    <div className="min-h-[40vh] text-[var(--sea-ink-soft)] italic">
      Editor placeholder — implemented in Task 12.
    </div>
  );
}
