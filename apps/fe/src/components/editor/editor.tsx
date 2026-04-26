import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { BubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";

export type EditorChange = { json: JSONContent; wordCount: number; title: string };

export type EditorProps = {
  docId: string;
  initialContent: JSONContent;
  onChange: (change: EditorChange) => void;
  onBlur?: () => void;
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

export function Editor({ docId, initialContent, onChange, onBlur }: EditorProps) {
  const extensions = useMemo(() => buildExtensions(), []);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
        handleDOMEvents: {
          blur: () => {
            onBlur?.();
            return false;
          },
        },
      },
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON();
        const title = extractTitle(json);
        const storage = ed.storage as unknown as Record<
          string,
          { words?: () => number } | undefined
        >;
        const words = storage.characterCount?.words?.() ?? 0;
        onChangeRef.current({ json, wordCount: words, title });
      },
    },
    [docId],
  );

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
