import { Editor as TiptapEditor, EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { BubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";
import {
  buildProposalsPlugin,
  pushProposalsToView,
  proposalPluginKey,
  type ProposalForPlugin,
  type ProposalCallbacks,
} from "./proposal-decorations";

export type EditorChange = { json: JSONContent; wordCount: number; title: string };

export type EditorProps = {
  docId: string;
  initialContent: JSONContent;
  onChange: (change: EditorChange) => void;
  onBlur?: () => void;
  proposals: ProposalForPlugin[];
  proposalCallbacks: ProposalCallbacks;
  onReady?: (editor: TiptapEditor) => void;
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

export function Editor({
  docId,
  initialContent,
  onChange,
  onBlur,
  proposals,
  proposalCallbacks,
  onReady,
}: EditorProps) {
  const extensions = useMemo(() => buildExtensions(), []);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const callbacksRef = useRef(proposalCallbacks);
  useEffect(() => {
    callbacksRef.current = proposalCallbacks;
  }, [proposalCallbacks]);

  // Build the plugin once. Callbacks read through the ref so they stay current
  // without re-installing the plugin.
  const proposalsPlugin = useMemo(
    () =>
      buildProposalsPlugin({
        onAccept: (id) => callbacksRef.current.onAccept(id),
        onReject: (id) => callbacksRef.current.onReject(id),
        renderContent: (md) => callbacksRef.current.renderContent(md),
      }),
    [],
  );

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

  // Register the proposals plugin once on mount.
  useEffect(() => {
    if (!editor) return;
    editor.registerPlugin(proposalsPlugin);
    onReady?.(editor);
    return () => {
      editor.unregisterPlugin(proposalPluginKey);
    };
  }, [editor, proposalsPlugin, onReady]);

  // Push fresh proposals on every change.
  useEffect(() => {
    if (!editor) return;
    pushProposalsToView(editor.view, proposals, {
      onAccept: (id) => callbacksRef.current.onAccept(id),
      onReject: (id) => callbacksRef.current.onReject(id),
      renderContent: (md) => callbacksRef.current.renderContent(md),
    });
  }, [editor, proposals]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  );
}
