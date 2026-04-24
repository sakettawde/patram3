import { useEffect, useReducer, useRef, useState } from "react";
import type { Editor as TEditor } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { Editor } from "#/components/editor/editor";
import { SectionToolbar } from "./section-toolbar";
import { SectionConflictBanner } from "./section-conflict-banner";
import { initialSectionSave, reduceSectionSave } from "#/lib/section-save-state";
import { ApiError, unwrap } from "#/lib/api-error";
import { useUpdateSection, useDeleteSection } from "#/queries/sections";
import { useUi } from "#/stores/ui";
import { extractSectionText } from "#/lib/extract-section-text";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "#/lib/query-keys";
import type { JSONContent } from "@tiptap/react";
import { api } from "#/lib/api";

const SAVE_DEBOUNCE_MS = 600;

export function SectionBlock({
  section,
  documentId,
  isOnlySection,
  onRequestAddBelow,
}: {
  section: Section;
  documentId: string;
  isOnlySection: boolean;
  onRequestAddBelow: () => void;
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
  const [conflict, setConflict] = useState(false);
  const setSaveState = useUi((s) => s.setSectionSaveState);
  const clearSaveState = useUi((s) => s.clearSectionSaveState);
  const update = useUpdateSection({ sectionId: section.id, documentId });
  const del = useDeleteSection({ sectionId: section.id, documentId });
  const qc = useQueryClient();

  // Keep the ref in sync with the latest prop value to avoid stale closures
  useEffect(() => {
    onRequestAddBelowRef.current = onRequestAddBelow;
  }, [onRequestAddBelow]);

  // Cleanup on unmount: flip mounted flag and clear all pending timers
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

  const triggerSave = () => {
    const ed = editorRef.current;
    if (!ed) return;

    // Serialize saves: if one is already in flight, mark a pending re-save and return.
    // The .finally() handler will re-arm the debounce once the current save settles.
    if (saveInFlightRef.current) {
      pendingResaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    const content = ed.getJSON();
    dispatch({ type: "saveStart" });
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
        if (e instanceof ApiError && e.is409VersionConflict()) {
          dispatch({ type: "conflict" });
          setConflict(true);
        } else {
          dispatch({ type: "networkError" });
        }
      })
      .finally(() => {
        saveInFlightRef.current = false;
        if (pendingResaveRef.current && mountedRef.current) {
          pendingResaveRef.current = false;
          // Re-arm the debounce to coalesce any further keystrokes during this tick
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

  const onCopyEditsThenReload = async () => {
    const ed = editorRef.current;
    if (ed) {
      const text = extractSectionText(ed.getJSON());
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* non-secure context — swallow */
      }
    }
    await discardAndReload();
  };

  const discardAndReload = async () => {
    const doc = await qc.fetchQuery({
      queryKey: qk.document(documentId),
      queryFn: async () =>
        unwrap<{ document: unknown; sections: Section[] }>(
          await api.documents[":id"].$get({ param: { id: documentId } }),
        ),
    });
    const fresh = doc.sections.find((s) => s.id === section.id);
    if (fresh && editorRef.current) {
      editorRef.current.commands.setContent(fresh.contentJson as JSONContent);
      versionRef.current = fresh.version;
    }
    setConflict(false);
    dispatch({ type: "reload" });
  };

  return (
    <section className="group relative rounded-md py-2 pl-3 focus-within:shadow-[inset_1px_0_0_var(--lagoon)]">
      <SectionToolbar
        state={state}
        disabledDelete={isOnlySection}
        onDelete={() => del.mutate()}
        onRetry={triggerSave}
        alwaysVisible={
          state.status === "saving" || state.status === "error" || state.status === "conflict"
        }
      />
      {conflict ? (
        <SectionConflictBanner
          onCopyEdits={onCopyEditsThenReload}
          onDiscardAndReload={discardAndReload}
        />
      ) : null}
      <Editor
        sectionId={section.id}
        initialContent={section.contentJson as JSONContent}
        onReady={(ed) => {
          editorRef.current = ed;
          // Ctrl/Cmd+Enter keymap: adds a new section below.
          // Reading from the ref avoids stale closure if the prop identity changes.
          ed.view.dom.addEventListener("keydown", (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onRequestAddBelowRef.current();
            }
          });
        }}
        onChange={onChange}
      />
    </section>
  );
}
