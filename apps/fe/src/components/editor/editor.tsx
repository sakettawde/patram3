import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { BubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";

const SAVE_DEBOUNCE_MS = 600;

export type EditorProps = {
  docId: string;
  initialContent: JSONContent;
  onUpdate: (args: { json: JSONContent; wordCount: number; title: string }) => void;
  onSavingChange: (saving: boolean) => void;
};

function extractTitle(json: JSONContent): string {
  const first = json.content?.[0];
  if (first?.type === "heading" && first.attrs?.level === 1) {
    const text = (first.content ?? [])
      .map((n) => (n.type === "text" ? (n.text ?? "") : ""))
      .join("")
      .trim();
    return text;
  }
  return "";
}

export function Editor({ docId, initialContent, onUpdate, onSavingChange }: EditorProps) {
  const extensions = useMemo(() => buildExtensions(), []);
  const saveTimer = useRef<number | null>(null);

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      autofocus: "end",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-slate max-w-none focus:outline-none text-[16px] leading-[1.7] text-(--ink)",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onSavingChange(true);
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          const json = ed.getJSON();
          const title = extractTitle(json);
          const storage = ed.storage as unknown as Record<
            string,
            { words?: () => number } | undefined
          >;
          const words = storage.characterCount?.words?.() ?? 0;
          onUpdate({ json, wordCount: words, title });
          onSavingChange(false);
        }, SAVE_DEBOUNCE_MS);
      },
    },
    [docId],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
