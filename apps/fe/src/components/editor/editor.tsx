import { EditorContent, type JSONContent, useEditor, type Editor as TEditor } from "@tiptap/react";
import { useEffect, useMemo } from "react";
import { BubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";

export type EditorProps = {
  sectionId: string;
  initialContent: JSONContent;
  onReady?: (editor: TEditor) => void;
  onChange?: (editor: TEditor) => void;
};

export function Editor({ sectionId, initialContent, onReady, onChange }: EditorProps) {
  const extensions = useMemo(() => buildExtensions(), []);
  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      autofocus: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-slate max-w-none focus:outline-none text-[15.5px] leading-[1.7] text-[color:rgb(33_74_80)]",
        },
      },
      onUpdate: ({ editor: ed }) => onChange?.(ed),
    },
    [sectionId],
  );

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
