import type { DocumentsState } from "#/stores/documents";

// Real seed content arrives in Task 6. Empty until then.
export function seedDocuments(): DocumentsState {
  return { docs: {}, order: [], selectedId: null };
}
