import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { DocStatus } from "#/lib/domain-types";
import type { SectionSave } from "#/lib/section-save-state";
import { initialSectionSave } from "#/lib/section-save-state";

export type UiState = {
  selectedDocumentId: string | null;
  selectedSectionId: string | null;
  sidebarCollapsed: boolean;
  statusFilter: DocStatus | "all";
  sectionSaveStates: Record<string, SectionSave>;
};

export type UiActions = {
  selectDocument: (id: string | null) => void;
  selectSection: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setStatusFilter: (v: DocStatus | "all") => void;
  setSectionSaveState: (sectionId: string, s: SectionSave) => void;
  clearSectionSaveState: (sectionId: string) => void;
};

export type UiStore = UiState & UiActions;

export function createUiStore(initial?: Partial<UiState>): StoreApi<UiStore> {
  return createStore<UiStore>((set) => ({
    selectedDocumentId: initial?.selectedDocumentId ?? null,
    selectedSectionId: initial?.selectedSectionId ?? null,
    sidebarCollapsed: initial?.sidebarCollapsed ?? false,
    statusFilter: initial?.statusFilter ?? "all",
    sectionSaveStates: initial?.sectionSaveStates ?? {},

    selectDocument: (id) => set({ selectedDocumentId: id, selectedSectionId: null }),
    selectSection: (id) => set({ selectedSectionId: id }),
    toggleSidebar: () => set((st) => ({ sidebarCollapsed: !st.sidebarCollapsed })),
    setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    setStatusFilter: (v) => set({ statusFilter: v }),

    setSectionSaveState: (sectionId, s) =>
      set((st) => ({ sectionSaveStates: { ...st.sectionSaveStates, [sectionId]: s } })),
    clearSectionSaveState: (sectionId) =>
      set((st) => {
        const next = { ...st.sectionSaveStates };
        delete next[sectionId];
        return { sectionSaveStates: next };
      }),
  }));
}

export const uiStore = createUiStore();

export function useUi<T>(selector: (s: UiStore) => T): T {
  return useStore(uiStore, selector);
}

// convenience for SectionBlock
export function ensureSectionSaveState(id: string): SectionSave {
  const st = uiStore.getState().sectionSaveStates[id];
  return st ?? initialSectionSave();
}
