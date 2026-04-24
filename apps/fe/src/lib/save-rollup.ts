import type { SectionSave } from "./section-save-state";

export type SaveRollup =
  | { kind: "saving" }
  | { kind: "unsaved" }
  | { kind: "editing" }
  | { kind: "saved"; savedAt: number };

export function computeSaveRollup(input: {
  sections: Record<string, SectionSave>;
  docMetadataPending: boolean;
}): SaveRollup {
  const states = Object.values(input.sections);
  if (input.docMetadataPending || states.some((s) => s.status === "saving")) {
    return { kind: "saving" };
  }
  if (states.some((s) => s.status === "error")) {
    return { kind: "unsaved" };
  }
  if (states.some((s) => s.status === "dirty")) {
    return { kind: "editing" };
  }
  const savedAt = states.reduce((max, s) => Math.max(max, s.lastSavedAt ?? 0), 0);
  return { kind: "saved", savedAt };
}
