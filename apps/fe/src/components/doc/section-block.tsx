import { useEffect, useRef, useState } from "react";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { Editor } from "#/components/editor/editor";
import { SectionToolbar } from "./section-toolbar";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { useSectionSave } from "#/lib/use-section-save";
import { useDeleteSection } from "#/queries/sections";
import { useUi } from "#/stores/ui";

export function SectionBlock({
  section,
  documentId,
  isOnlySection,
  onRequestAddBelow,
  onEditorReady,
  onFocusPrev,
  onFocusNext,
}: {
  section: Section;
  documentId: string;
  isOnlySection: boolean;
  onRequestAddBelow: () => void;
  onEditorReady?: (id: string, editor: TEditor) => void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
}) {
  const [editor, setEditor] = useState<TEditor | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { state, flushNow, initialContent } = useSectionSave({
    section,
    documentId,
    editor,
  });
  const del = useDeleteSection({ sectionId: section.id, documentId });
  const setSaveState = useUi((s) => s.setSectionSaveState);
  const clearSaveState = useUi((s) => s.clearSectionSaveState);

  const onRequestAddBelowRef = useRef(onRequestAddBelow);
  const onFocusPrevRef = useRef(onFocusPrev);
  const onFocusNextRef = useRef(onFocusNext);
  useEffect(() => {
    onRequestAddBelowRef.current = onRequestAddBelow;
  }, [onRequestAddBelow]);
  useEffect(() => {
    onFocusPrevRef.current = onFocusPrev;
  }, [onFocusPrev]);
  useEffect(() => {
    onFocusNextRef.current = onFocusNext;
  }, [onFocusNext]);

  useEffect(() => {
    setSaveState(section.id, state);
  }, [state, section.id, setSaveState]);
  useEffect(() => () => clearSaveState(section.id), [section.id, clearSaveState]);

  // Register keyboard shortcuts once per editor instance with proper cleanup.
  // Inlining this inside onReady piled up a new listener on every re-render,
  // which turned one Ctrl+Enter into N POST /sections requests.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onRequestAddBelowRef.current();
        return;
      }
      if (e.key === "ArrowDown") {
        const { selection, doc } = editor.state;
        if (selection.$head.pos >= doc.content.size - 1) {
          e.preventDefault();
          onFocusNextRef.current?.();
        }
      }
      if (e.key === "ArrowUp") {
        const { selection } = editor.state;
        if (selection.$head.pos <= 1) {
          e.preventDefault();
          onFocusPrevRef.current?.();
        }
      }
    };
    dom.addEventListener("keydown", handler);
    return () => dom.removeEventListener("keydown", handler);
  }, [editor]);

  return (
    <section className="section-block group relative py-3">
      <SectionToolbar
        state={state}
        disabledDelete={isOnlySection}
        onDelete={() => {
          const text = editor?.getText() ?? "";
          if (text.length > 50) {
            setConfirmDeleteOpen(true);
          } else {
            del.mutate();
          }
        }}
        onRetry={() => void flushNow()}
        alwaysVisible={state.status === "saving" || state.status === "error"}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete this section?"
        description="Its contents will be removed from the document and can't be recovered."
        confirmLabel="Delete section"
        cancelLabel="Keep"
        tone="destructive"
        onConfirm={() => del.mutate()}
      />
      <Editor
        sectionId={section.id}
        initialContent={initialContent as JSONContent}
        onReady={(ed) => {
          setEditor(ed);
          onEditorReady?.(section.id, ed);
        }}
      />
    </section>
  );
}
