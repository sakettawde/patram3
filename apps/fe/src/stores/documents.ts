import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { nanoid } from "nanoid";
import type { JSONContent } from "@tiptap/react";
import { seedDocuments } from "#/lib/seed-docs";

export type Doc = {
  id: string;
  title: string;
  emoji: string;
  tag: string | null;
  contentJson: JSONContent;
  wordCount: number;
  updatedAt: number;
  pinned: boolean;
};

export type DocumentsState = {
  docs: Record<string, Doc>;
  order: string[];
  selectedId: string | null;
};

export type DocumentsActions = {
  createDoc: () => string;
  updateDoc: (id: string, patch: Partial<Doc>, updatedAt?: number) => void;
  pinDoc: (id: string, pinned: boolean) => void;
  deleteDoc: (id: string) => void;
  selectDoc: (id: string) => void;
  renameDoc: (id: string, title: string) => void;
  setEmoji: (id: string, emoji: string) => void;
};

export type DocumentsStore = DocumentsState & DocumentsActions;

const emptyDoc = (): Doc => ({
  id: nanoid(8),
  title: "Untitled",
  emoji: "📝",
  tag: null,
  contentJson: { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
  wordCount: 0,
  updatedAt: Date.now(),
  pinned: false,
});

export function createDocumentsStore(opts: { seed?: boolean } = {}): StoreApi<DocumentsStore> {
  const seed = opts.seed ?? true;
  return createStore<DocumentsStore>((set, get) => {
    const initial: DocumentsState = seed
      ? seedDocuments()
      : { docs: {}, order: [], selectedId: null };

    return {
      ...initial,

      createDoc: () => {
        const d = emptyDoc();
        set((st) => ({
          docs: { ...st.docs, [d.id]: d },
          order: [...st.order, d.id],
          selectedId: d.id,
        }));
        return d.id;
      },

      updateDoc: (id, patch, updatedAt) => {
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          const next: Doc = { ...existing, ...patch, updatedAt: updatedAt ?? Date.now() };
          return { docs: { ...st.docs, [id]: next } };
        });
      },

      pinDoc: (id, pinned) => {
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          return { docs: { ...st.docs, [id]: { ...existing, pinned } } };
        });
      },

      deleteDoc: (id) => {
        set((st) => {
          if (!st.docs[id]) return st;
          const nextDocs = { ...st.docs };
          delete nextDocs[id];
          const nextOrder = st.order.filter((x) => x !== id);
          const nextSelected =
            st.selectedId === id ? (nextOrder[nextOrder.length - 1] ?? null) : st.selectedId;
          return { docs: nextDocs, order: nextOrder, selectedId: nextSelected };
        });
      },

      selectDoc: (id) => {
        if (!get().docs[id]) return;
        set({ selectedId: id });
      },

      renameDoc: (id, title) => {
        const clean = title.trim();
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          return {
            docs: {
              ...st.docs,
              [id]: { ...existing, title: clean === "" ? "Untitled" : clean },
            },
          };
        });
      },

      setEmoji: (id, emoji) => {
        set((st) => {
          const existing = st.docs[id];
          if (!existing) return st;
          return { docs: { ...st.docs, [id]: { ...existing, emoji } } };
        });
      },
    };
  });
}

// Singleton used by the app
export const documentsStore = createDocumentsStore();

export function useDocuments<T>(selector: (s: DocumentsStore) => T): T {
  return useStore(documentsStore, selector);
}
