import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

export type DocumentsUiState = {
  selectedId: string | null;
};

export type DocumentsUiActions = {
  selectDoc: (id: string | null) => void;
};

export type DocumentsUiStore = DocumentsUiState & DocumentsUiActions;

export function createDocumentsStore(): StoreApi<DocumentsUiStore> {
  return createStore<DocumentsUiStore>((set) => ({
    selectedId: null,
    selectDoc: (id) => set({ selectedId: id }),
  }));
}

export const documentsStore = createDocumentsStore();

export function useDocuments<T>(selector: (s: DocumentsUiStore) => T): T {
  return useStore(documentsStore, selector);
}
