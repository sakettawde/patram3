import { EditorContent, type JSONContent, useEditor, type Editor as TEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
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
  // Hold callbacks in refs so their identity doesn't drive effects — onReady
  // should fire once per editor instance, not on every parent re-render.
  const onReadyRef = useRef(onReady);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
      onUpdate: ({ editor: ed }) => onChangeRef.current?.(ed),
    },
    [sectionId],
  );

  useEffect(() => {
    if (editor) onReadyRef.current?.(editor);
  }, [editor]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
