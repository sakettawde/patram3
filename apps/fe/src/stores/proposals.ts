import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

export type Proposal = {
  id: string;
  kind: "replace" | "insert_after" | "delete";
  blockId: string;
  afterBlockId?: string;
  content?: string;
  toolUseId: string;
  createdAt: number;
};

export type ProposalsState = {
  byDoc: Record<string, Proposal[]>;
};

export type ProposalsActions = {
  addProposal: (docId: string, p: Proposal) => void;
  removeProposal: (docId: string, proposalId: string) => void;
  removeProposalsByBlockId: (docId: string, blockId: string) => void;
  clearProposals: (docId: string) => void;
};

export type ProposalsStore = ProposalsState & ProposalsActions;

export function createProposalsStore(): StoreApi<ProposalsStore> {
  return createStore<ProposalsStore>((set) => ({
    byDoc: {},
    addProposal: (docId, p) =>
      set((state) => ({
        byDoc: { ...state.byDoc, [docId]: [...(state.byDoc[docId] ?? []), p] },
      })),
    removeProposal: (docId, proposalId) =>
      set((state) => ({
        byDoc: {
          ...state.byDoc,
          [docId]: (state.byDoc[docId] ?? []).filter((p) => p.id !== proposalId),
        },
      })),
    removeProposalsByBlockId: (docId, blockId) =>
      set((state) => ({
        byDoc: {
          ...state.byDoc,
          [docId]: (state.byDoc[docId] ?? []).filter((p) => p.blockId !== blockId),
        },
      })),
    clearProposals: (docId) => set((state) => ({ byDoc: { ...state.byDoc, [docId]: [] } })),
  }));
}

export const proposalsStore = createProposalsStore();

export function useProposals<T>(selector: (s: ProposalsStore) => T): T {
  return useStore(proposalsStore, selector);
}
