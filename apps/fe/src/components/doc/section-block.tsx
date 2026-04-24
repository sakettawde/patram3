import { useEffect, useReducer, useRef } from "react";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { Editor } from "#/components/editor/editor";
import { SectionToolbar } from "./section-toolbar";
import { initialSectionSave, reduceSectionSave } from "#/lib/section-save-state";
import { ApiError } from "#/lib/api-error";
import { useUpdateSection, useDeleteSection } from "#/queries/sections";
import { useUi } from "#/stores/ui";

const SAVE_DEBOUNCE_MS = 600;
const MAX_VERSION_RETRIES = 5;

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
  const [state, dispatch] = useReducer(reduceSectionSave, initialSectionSave());
  const editorRef = useRef<TEditor | null>(null);
  const versionRef = useRef<number>(section.version);
  const timer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const saveInFlightRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const onRequestAddBelowRef = useRef(onRequestAddBelow);
  const onFocusPrevRef = useRef(onFocusPrev);
  const onFocusNextRef = useRef(onFocusNext);
  const setSaveState = useUi((s) => s.setSectionSaveState);
  const clearSaveState = useUi((s) => s.clearSectionSaveState);
  const update = useUpdateSection({ sectionId: section.id, documentId });
  const del = useDeleteSection({ sectionId: section.id, documentId });

  useEffect(() => {
    onRequestAddBelowRef.current = onRequestAddBelow;
  }, [onRequestAddBelow]);

  useEffect(() => {
    onFocusPrevRef.current = onFocusPrev;
  }, [onFocusPrev]);

  useEffect(() => {
    onFocusNextRef.current = onFocusNext;
  }, [onFocusNext]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timer.current) window.clearTimeout(timer.current);
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    },
    [],
  );

  useEffect(() => {
    setSaveState(section.id, state);
  }, [state, section.id, setSaveState]);

  useEffect(() => {
    return () => clearSaveState(section.id);
  }, [section.id, clearSaveState]);

  // Save the editor contents. On 409 (stale expectedVersion) we silently adopt
  // the server's current version and retry — last-writer-wins. The BE still
  // bumps the version counter; the UI treats version mismatch as invisible plumbing.
  const triggerSave = () => {
    const ed = editorRef.current;
    if (!ed) return;

    if (saveInFlightRef.current) {
      pendingResaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    const content = ed.getJSON();
    dispatch({ type: "saveStart" });

    const attempt = (retriesLeft: number): Promise<void> =>
      update
        .mutateAsync({ contentJson: content, expectedVersion: versionRef.current })
        .then((updated) => {
          if (!mountedRef.current) return;
          versionRef.current = updated.version;
          dispatch({ type: "saveOk", at: Date.now() });
          fadeTimer.current = window.setTimeout(() => {
            if (mountedRef.current) dispatch({ type: "fade" });
          }, 1500);
        })
        .catch((e: unknown) => {
          if (!mountedRef.current) return;
          if (e instanceof ApiError && e.is409VersionConflict() && retriesLeft > 0) {
            const body = e.body as { currentVersion?: number } | null;
            if (body?.currentVersion) versionRef.current = body.currentVersion;
            return attempt(retriesLeft - 1);
          }
          dispatch({ type: "networkError" });
        });

    attempt(MAX_VERSION_RETRIES).finally(() => {
      saveInFlightRef.current = false;
      if (pendingResaveRef.current && mountedRef.current) {
        pendingResaveRef.current = false;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(triggerSave, SAVE_DEBOUNCE_MS);
      }
    });
  };

  const onChange = (_ed: TEditor) => {
    dispatch({ type: "edit" });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(triggerSave, SAVE_DEBOUNCE_MS);
  };

  return (
    <section className="group relative rounded-md py-2 pl-3 focus-within:shadow-[inset_1px_0_0_var(--lagoon)]">
      <SectionToolbar
        state={state}
        disabledDelete={isOnlySection}
        onDelete={() => del.mutate()}
        onRetry={triggerSave}
        alwaysVisible={state.status === "saving" || state.status === "error"}
      />
      <Editor
        sectionId={section.id}
        initialContent={section.contentJson as JSONContent}
        onReady={(ed) => {
          editorRef.current = ed;
          onEditorReady?.(section.id, ed);
          ed.view.dom.addEventListener("keydown", (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onRequestAddBelowRef.current();
            }
            if (e.key === "ArrowDown") {
              const { selection, doc } = ed.state;
              if (selection.$head.pos >= doc.content.size - 1) {
                e.preventDefault();
                onFocusNextRef.current?.();
              }
            }
            if (e.key === "ArrowUp") {
              const { selection } = ed.state;
              if (selection.$head.pos <= 1) {
                e.preventDefault();
                onFocusPrevRef.current?.();
              }
            }
          });
        }}
        onChange={onChange}
      />
    </section>
  );
}
