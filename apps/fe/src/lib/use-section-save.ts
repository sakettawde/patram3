import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { useUpdateSection } from "#/queries/sections";
import { ApiError } from "#/lib/api-error";
import { clearLocalSnapshot, getLocalSnapshot, putLocalSnapshot } from "#/lib/section-save-store";
import { initialSectionSave, reduceSectionSave, type SectionSave } from "#/lib/section-save-state";

const IDLE_DEBOUNCE_MS = 2000;
const SAVED_FADE_MS = 1500;
const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const ERROR_SURFACE_THRESHOLD = 3;

type UseSectionSaveArgs = {
  section: Section;
  documentId: string;
  editor: TEditor | null;
};

type UseSectionSaveResult = {
  state: SectionSave;
  flushNow: () => Promise<void>;
  initialContent: JSONContent;
};

function resolveInitialContent(section: Section): {
  content: JSONContent;
  seededFromLocal: boolean;
} {
  const snap = getLocalSnapshot(section.id);
  const serverMs = new Date(section.updatedAt).getTime();
  if (!snap) return { content: section.contentJson as JSONContent, seededFromLocal: false };
  if (snap.savedAt > serverMs) {
    return { content: snap.contentJson, seededFromLocal: true };
  }
  clearLocalSnapshot(section.id);
  return { content: section.contentJson as JSONContent, seededFromLocal: false };
}

export function useSectionSave({
  section,
  documentId,
  editor,
}: UseSectionSaveArgs): UseSectionSaveResult {
  const [{ content, seededFromLocal }] = useState(() => resolveInitialContent(section));
  const [state, dispatch] = useReducer(reduceSectionSave, undefined, () =>
    seededFromLocal ? { ...initialSectionSave(), status: "dirty" as const } : initialSectionSave(),
  );

  const update = useUpdateSection({ sectionId: section.id, documentId });
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const mountedRef = useRef(true);
  const saveInFlightRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const attemptsRef = useRef(0);
  // Tracks whether the section has unsaved edits. Kept separate from the
  // reducer state because the reducer briefly transitions saving → saved
  // → idle, but dirtyRef should only flip back to false once a save lands.
  // Seeded `true` when we recovered content from localStorage so the
  // recovery flush actually fires.
  const dirtyRef = useRef(seededFromLocal);
  const debounceTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const editorRef = useRef<TEditor | null>(editor);
  const flushNowRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      // Best-effort final flush from the localStorage snapshot, if any.
      // Uses the snapshot (not editor.getJSON()) because the editor may
      // already be torn down. localStorage still has the snapshot, so even
      // if this mutation fails the next mount will recover.
      const snap = getLocalSnapshot(section.id);
      if (snap) {
        void updateRef.current.mutateAsync({ contentJson: snap.contentJson }).catch(() => {
          // best-effort
        });
      }
    },
    [section.id],
  );

  const flushNow = useCallback(async (): Promise<void> => {
    const ed = editorRef.current;
    if (!ed) return;
    // Nothing to save — don't fire a PATCH just because the editor blurred
    // or the component is unmounting with clean content.
    if (!dirtyRef.current) return;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (saveInFlightRef.current) {
      pendingResaveRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    const json = ed.getJSON();
    dispatch({ type: "saveStart" });
    try {
      await updateRef.current.mutateAsync({ contentJson: json });
      if (!mountedRef.current) return;
      attemptsRef.current = 0;
      dirtyRef.current = false;
      clearLocalSnapshot(section.id);
      dispatch({ type: "saveOk", at: Date.now() });
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) dispatch({ type: "fade" });
      }, SAVED_FADE_MS);
    } catch (err) {
      if (!mountedRef.current) return;
      attemptsRef.current += 1;
      const isHard4xx =
        err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429;
      if (isHard4xx) {
        dispatch({ type: "saveErr" });
        // No auto-retry for hard 4xx; user-triggered retry via pip.
      } else {
        if (attemptsRef.current >= ERROR_SURFACE_THRESHOLD) {
          dispatch({ type: "saveErr" });
        } else {
          dispatch({ type: "edit" }); // stay "dirty" under the threshold
        }
        const idx = Math.min(attemptsRef.current - 1, RETRY_BACKOFF_MS.length - 1);
        const delay = RETRY_BACKOFF_MS[idx]!;
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          if (mountedRef.current) void flushNowRef.current();
        }, delay);
      }
    } finally {
      saveInFlightRef.current = false;
      if (pendingResaveRef.current && mountedRef.current) {
        pendingResaveRef.current = false;
        window.setTimeout(() => void flushNowRef.current(), 0);
      }
    }
  }, [section.id]);

  useEffect(() => {
    flushNowRef.current = flushNow;
  }, [flushNow]);

  // Register editor listeners once an editor is available.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      const json = editor.getJSON();
      putLocalSnapshot(section.id, { contentJson: json, savedAt: Date.now() });
      dirtyRef.current = true;
      dispatch({ type: "edit" });
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        void flushNowRef.current();
      }, IDLE_DEBOUNCE_MS);
    };
    const onBlur = () => {
      void flushNowRef.current();
    };
    editor.on("update", onUpdate);
    editor.on("blur", onBlur);
    return () => {
      editor.off("update", onUpdate);
      editor.off("blur", onBlur);
    };
  }, [editor, section.id]);

  // If we seeded from local, flush the recovered content once the editor is ready.
  const recoveredFlushedRef = useRef(false);
  useEffect(() => {
    if (!seededFromLocal || !editor || recoveredFlushedRef.current) return;
    recoveredFlushedRef.current = true;
    void flushNowRef.current();
  }, [editor, seededFromLocal]);

  // Fire-and-forget beacon on tab close / reload so unsaved edits still land.
  useEffect(() => {
    const handler = () => {
      const snap = getLocalSnapshot(section.id);
      if (!snap) return;
      const url = `/api/sections/${section.id}`;
      const blob = new Blob([JSON.stringify({ contentJson: snap.contentJson })], {
        type: "application/json",
      });
      try {
        navigator.sendBeacon(url, blob);
      } catch {
        // best-effort
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [section.id]);

  return { state, flushNow, initialContent: content };
}
