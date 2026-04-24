import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Editor as TEditor, JSONContent } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { useUpdateSection } from "#/queries/sections";
import { clearLocalSnapshot, getLocalSnapshot } from "#/lib/section-save-store";
import { initialSectionSave, reduceSectionSave, type SectionSave } from "#/lib/section-save-state";

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
  const [state] = useReducer(reduceSectionSave, undefined, () =>
    seededFromLocal ? { ...initialSectionSave(), status: "dirty" as const } : initialSectionSave(),
  );

  const update = useUpdateSection({ sectionId: section.id, documentId });
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Save pipeline lands in Task 5B.
  const flushNow = useCallback(async (): Promise<void> => {
    // intentionally empty at this phase
  }, []);

  // Intentionally unused until 5B wires the save pipeline.
  void editor;

  return { state, flushNow, initialContent: content };
}
