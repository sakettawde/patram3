import { useStore } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";

export type SidebarTab = "docs" | "sessions";

export type UiStore = {
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
};

export function createUiStore(): StoreApi<UiStore> {
  return createStore<UiStore>()(
    persist(
      (set) => ({
        sidebarTab: "docs",
        setSidebarTab: (tab) => set({ sidebarTab: tab }),
      }),
      {
        name: "patram.ui.v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({ sidebarTab: s.sidebarTab }),
      },
    ),
  );
}

export const uiStore = createUiStore();

export function useUi<T>(selector: (s: UiStore) => T): T {
  return useStore(uiStore, selector);
}
