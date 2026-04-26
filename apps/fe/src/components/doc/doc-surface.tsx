import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useUser } from "#/auth/auth-gate";
import { Editor } from "#/components/editor/editor";
import { ReviewBar } from "#/components/editor/review-bar";
import { useDocumentsQuery, useUpdateDoc } from "#/queries/documents";
import { useDocuments } from "#/stores/documents";
import { useAssistant } from "#/stores/assistant";
import { uiStore } from "#/stores/ui";
import { proposalsStore, useProposals, type Proposal } from "#/stores/proposals";
import { pushProposalsToView } from "#/components/editor/proposal-decorations";
import { markdownToHtml } from "#/lib/markdown-to-html";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";

type SaveState = "idle" | "saving";

// Stable empty fallback — see the useProposals call below.
const EMPTY_PROPOSALS: Proposal[] = [];

export function DocSurface() {
  const user = useUser();
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const query = useDocumentsQuery(user.id);

  // When the list lands and nothing is selected (fresh load, or after the
  // selected doc was deleted), default to the most recently created doc.
  useEffect(() => {
    if (selectedId !== null) return;
    const list = query.data;
    if (!list || list.length === 0) return;
    selectDoc(list[list.length - 1].id);
  }, [query.data, selectedId, selectDoc]);

  const doc = useMemo(
    () => query.data?.find((d) => d.id === selectedId) ?? null,
    [query.data, selectedId],
  );

  const selectSessionForDoc = useAssistant((s) => s.selectSessionForDoc);
  useEffect(() => {
    if (!doc) return;
    selectSessionForDoc(doc.id);
  }, [doc?.id, selectSessionForDoc]);

  const updater = useUpdateDoc(user.id, doc?.id ?? null);
  const saveState = useSyncExternalStore<SaveState>(
    updater.subscribe,
    updater.getState,
    () => "idle",
  );
  useEffect(() => {
    uiStore.getState().setSaving(saveState === "saving");
    return () => uiStore.getState().setSaving(false);
  }, [saveState]);

  // Flush on tab close / route change.
  // Depend on `updater.flush` (a stable useCallback result), NOT `updater`.
  // `useUpdateDoc` returns a fresh object literal every render, so `[updater]`
  // would re-fire this effect's cleanup on every keystroke (because schedule()
  // calls setState("saving"), which re-renders), and the cleanup's flush()
  // would clear the just-set 2 s timer and send immediately — defeating the
  // debounce.
  const flush = updater.flush;
  useEffect(() => {
    const onBeforeUnload = () => {
      void flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  // Track the last sent title heading to avoid scheduling no-op patches.
  const [lastSent, setLastSent] = useState<{ titleHeading: string }>({ titleHeading: "" });

  // Proposals + editor handle.
  // The selector must return a stable reference when there are no proposals,
  // otherwise Zustand notifies on every render (new `[]` literal each time)
  // and we hit "Maximum update depth exceeded".
  const proposals = useProposals((s) => (doc ? s.byDoc[doc.id] : undefined)) ?? EMPTY_PROPOSALS;
  const editorRef = useRef<TiptapEditor | null>(null);

  const onEditorReady = useCallback((ed: TiptapEditor) => {
    editorRef.current = ed;
  }, []);

  // Push the current store proposals into the editor's plugin state so the
  // overlay updates in the same tick the store mutates. The Editor's own
  // useEffect also pushes — but that only fires after React commits a
  // re-render, which is one tick later. Without this synchronous push, the
  // overlay can linger briefly (or, if a stale plugin state's decorations
  // get re-resolved against the post-apply doc and find a still-matching
  // block, longer than briefly).
  const syncProposalsToView = useCallback(() => {
    if (!doc || !editorRef.current) return;
    const next = (proposalsStore.getState().byDoc[doc.id] ?? []).map((q) => ({
      id: q.id,
      kind: q.kind,
      blockId: q.blockId,
      afterBlockId: q.afterBlockId,
      content: q.content,
    }));
    pushProposalsToView(editorRef.current.view, next, {
      onAccept: (id) => acceptProposalRef.current(id),
      onReject: (id) => rejectProposalRef.current(id),
      renderContent: (md) => markdownToHtml(md),
    });
  }, [doc]);

  const acceptProposal = useCallback(
    (proposalId: string) => {
      if (!doc) return;
      const list = proposalsStore.getState().byDoc[doc.id] ?? [];
      const p = list.find((x) => x.id === proposalId);
      if (!p) return;
      proposalsStore.getState().removeProposal(doc.id, proposalId);
      applyProposalToEditor(p, editorRef.current);
      syncProposalsToView();
    },
    [doc, syncProposalsToView],
  );

  const rejectProposal = useCallback(
    (proposalId: string) => {
      if (!doc) return;
      proposalsStore.getState().removeProposal(doc.id, proposalId);
      syncProposalsToView();
    },
    [doc, syncProposalsToView],
  );

  const acceptAll = useCallback(() => {
    if (!doc) return;
    const list = [...(proposalsStore.getState().byDoc[doc.id] ?? [])];
    // Apply in reverse document order: editing a block at position N shifts
    // the positions of every block after it. Targeting later blocks first
    // means the earlier blocks' ids and positions stay stable for our
    // subsequent applies. (We resolve by id every time too, but reversing
    // also avoids pathological cases — e.g. a replace whose new content
    // includes a block whose id collides with a later proposal target.)
    list.sort((a, b) => orderInDoc(b, a, editorRef.current));
    proposalsStore.getState().clearProposals(doc.id);
    for (const p of list) applyProposalToEditor(p, editorRef.current);
    syncProposalsToView();
  }, [doc, syncProposalsToView]);

  const rejectAll = useCallback(() => {
    if (!doc) return;
    proposalsStore.getState().clearProposals(doc.id);
    syncProposalsToView();
  }, [doc, syncProposalsToView]);

  // Refs so syncProposalsToView's callbacks always read the current handlers
  // without making the plugin re-register on every render.
  const acceptProposalRef = useRef(acceptProposal);
  const rejectProposalRef = useRef(rejectProposal);
  useEffect(() => {
    acceptProposalRef.current = acceptProposal;
  }, [acceptProposal]);
  useEffect(() => {
    rejectProposalRef.current = rejectProposal;
  }, [rejectProposal]);

  const proposalCallbacks = useMemo(
    () => ({
      onAccept: acceptProposal,
      onReject: rejectProposal,
      renderContent: (md: string) => markdownToHtml(md),
    }),
    [acceptProposal, rejectProposal],
  );

  // Convert store Proposal[] to ProposalForPlugin[] for the editor.
  const proposalsForPlugin = useMemo(
    () =>
      proposals.map((p) => ({
        id: p.id,
        kind: p.kind,
        blockId: p.blockId,
        afterBlockId: p.afterBlockId,
        content: p.content,
      })),
    [proposals],
  );

  const handleEditorChange = useCallback(
    ({ json, title }: { json: JSONContent; title: string }) => {
      const patch: { contentJson: JSONContent; title?: string } = { contentJson: json };
      if (title && title !== lastSent.titleHeading) {
        patch.title = title;
        setLastSent({ titleHeading: title });
      }
      updater.schedule(patch);

      // Auto-reject proposals whose target block disappeared (user edited it
      // away or accepted an earlier proposal that removed it).
      if (!doc) return;
      const currentList = proposalsStore.getState().byDoc[doc.id] ?? [];
      if (currentList.length === 0) return;
      const blockIds = new Set<string>();
      walkBlocks(json, (block) => {
        if (typeof block.attrs?.id === "string") blockIds.add(block.attrs.id);
      });
      for (const p of currentList) {
        if (p.kind === "insert_after") continue;
        if (!blockIds.has(p.blockId)) {
          proposalsStore.getState().removeProposal(doc.id, p.id);
        }
      }
    },
    [doc, lastSent, updater],
  );

  if (!doc) {
    return (
      <div className="mx-auto max-w-170 px-6 pt-32 text-center text-[14px] text-(--ink-faint)">
        {query.isPending ? "Loading…" : "No document selected"}
      </div>
    );
  }

  const initial: JSONContent = JSON.parse(doc.contentJson);

  return (
    <div className="mx-auto w-full max-w-170 px-6 pt-20 pb-24">
      <ReviewBar
        count={proposalsForPlugin.length}
        onAcceptAll={acceptAll}
        onRejectAll={rejectAll}
      />
      <Editor
        docId={doc.id}
        initialContent={initial}
        onChange={handleEditorChange}
        onBlur={() => {
          void updater.flush();
        }}
        proposals={proposalsForPlugin}
        proposalCallbacks={proposalCallbacks}
        onReady={onEditorReady}
      />
    </div>
  );
}

// ---- helpers ----

function applyProposalToEditor(p: Proposal, editor: TiptapEditor | null): void {
  if (!editor) return;
  const view = editor.view;

  if (p.kind === "delete") {
    const target = findBlockPos(view.state.doc, p.blockId);
    if (!target) return;
    // deleteRange goes through Tiptap's command pipeline so list/quote parents
    // are joined cleanly instead of leaving an empty wrapper.
    editor
      .chain()
      .focus()
      .deleteRange({ from: target.pos, to: target.pos + target.size })
      .run();
    return;
  }

  if (p.kind === "replace") {
    const target = findBlockPos(view.state.doc, p.blockId);
    if (!target) return;
    // insertContentAt with a {from,to} range deletes the range first and then
    // inserts the parsed HTML as proper block content. Doing this through
    // Tiptap (instead of view.dispatch(tr.replace(..., parseSlice(...))))
    // matters because parseSlice can produce open-boundary slices for inline-
    // only HTML, which leaves the original block in place and appends the
    // new content elsewhere — exactly the "added at the bottom, original
    // didn't disappear" symptom.
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: target.pos, to: target.pos + target.size },
        markdownToHtml(p.content ?? ""),
      )
      .run();
    return;
  }

  if (p.kind === "insert_after") {
    const insertPos =
      p.afterBlockId === "TOP"
        ? 0
        : (() => {
            const t = findBlockPos(view.state.doc, p.afterBlockId ?? "");
            return t ? t.pos + t.size : null;
          })();
    if (insertPos === null) return;
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, markdownToHtml(p.content ?? ""))
      .run();
  }
}

function findBlockPos(doc: PMNode, id: string): { pos: number; size: number } | null {
  let found: { pos: number; size: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs?.id === id) {
      found = { pos, size: node.nodeSize };
      return false;
    }
    return true;
  });
  return found;
}

function orderInDoc(a: Proposal, b: Proposal, editor: TiptapEditor | null): number {
  if (!editor) return 0;
  const ap = findBlockPos(editor.view.state.doc, a.blockId)?.pos ?? Number.MAX_SAFE_INTEGER;
  const bp = findBlockPos(editor.view.state.doc, b.blockId)?.pos ?? Number.MAX_SAFE_INTEGER;
  return ap - bp;
}

function walkBlocks(node: JSONContent, visit: (block: JSONContent) => void): void {
  if (!node.content) return;
  for (const child of node.content) {
    visit(child);
    walkBlocks(child, visit);
  }
}
