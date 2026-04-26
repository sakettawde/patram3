import { describe, expect, test, beforeEach } from "vite-plus/test";
import { createProposalsStore, type Proposal } from "./proposals";

const make = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  kind: "replace",
  blockId: "b1",
  content: "**hi**",
  toolUseId: "tu1",
  createdAt: 0,
  ...over,
});

describe("proposals store", () => {
  let store: ReturnType<typeof createProposalsStore>;
  beforeEach(() => {
    store = createProposalsStore();
  });

  test("addProposal appends to a doc's list", () => {
    store.getState().addProposal("doc1", make());
    expect(store.getState().byDoc.doc1).toEqual([make()]);
  });

  test("multiple docs are isolated", () => {
    store.getState().addProposal("doc1", make({ id: "p1" }));
    store.getState().addProposal("doc2", make({ id: "p2" }));
    expect(store.getState().byDoc.doc1?.[0]?.id).toBe("p1");
    expect(store.getState().byDoc.doc2?.[0]?.id).toBe("p2");
  });

  test("removeProposal drops by id", () => {
    store.getState().addProposal("doc1", make({ id: "p1" }));
    store.getState().addProposal("doc1", make({ id: "p2" }));
    store.getState().removeProposal("doc1", "p1");
    expect(store.getState().byDoc.doc1?.map((p) => p.id)).toEqual(["p2"]);
  });

  test("clearProposals empties a doc", () => {
    store.getState().addProposal("doc1", make({ id: "p1" }));
    store.getState().clearProposals("doc1");
    expect(store.getState().byDoc.doc1 ?? []).toEqual([]);
  });

  test("removeProposalsByBlockId drops all proposals targeting a block", () => {
    store.getState().addProposal("doc1", make({ id: "p1", blockId: "b1" }));
    store.getState().addProposal("doc1", make({ id: "p2", blockId: "b1" }));
    store.getState().addProposal("doc1", make({ id: "p3", blockId: "b2" }));
    store.getState().removeProposalsByBlockId("doc1", "b1");
    expect(store.getState().byDoc.doc1?.map((p) => p.id)).toEqual(["p3"]);
  });
});
