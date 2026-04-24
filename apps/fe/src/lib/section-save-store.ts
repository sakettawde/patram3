import type { JSONContent } from "@tiptap/react";

export type LocalSnapshot = {
  contentJson: JSONContent;
  savedAt: number;
};

const keyFor = (sectionId: string) => `patram:section:${sectionId}`;

export function getLocalSnapshot(sectionId: string): LocalSnapshot | null {
  try {
    const raw = window.localStorage.getItem(keyFor(sectionId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as LocalSnapshot;
    if (typeof parsed?.savedAt !== "number" || typeof parsed?.contentJson !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function putLocalSnapshot(sectionId: string, snap: LocalSnapshot): void {
  try {
    window.localStorage.setItem(keyFor(sectionId), JSON.stringify(snap));
  } catch {
    // Quota exceeded / unavailable storage: safety net is best-effort.
  }
}

export function clearLocalSnapshot(sectionId: string): void {
  try {
    window.localStorage.removeItem(keyFor(sectionId));
  } catch {
    // ignore
  }
}
