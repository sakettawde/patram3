import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export type ProposalForPlugin = {
  id: string;
  kind: "replace" | "insert_after" | "delete";
  blockId: string;
  afterBlockId?: string;
  content?: string;
};

export type ProposalCallbacks = {
  onAccept: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
  renderContent: (markdown: string) => string;
};

type PluginState = {
  proposals: ProposalForPlugin[];
  cb: ProposalCallbacks;
};

export const proposalPluginKey = new PluginKey<PluginState>("proposals");

export function buildProposalsPlugin(initialCallbacks: ProposalCallbacks): Plugin {
  return new Plugin<PluginState>({
    key: proposalPluginKey,
    state: {
      init: () => ({ proposals: [], cb: initialCallbacks }),
      apply(tr, prev) {
        const meta = tr.getMeta(proposalPluginKey) as
          | { proposals?: ProposalForPlugin[]; cb?: ProposalCallbacks }
          | undefined;
        if (!meta) return prev;
        return {
          proposals: meta.proposals ?? prev.proposals,
          cb: meta.cb ?? prev.cb,
        };
      },
    },
    props: {
      decorations(state) {
        const ps = proposalPluginKey.getState(state);
        if (!ps || ps.proposals.length === 0) return DecorationSet.empty;
        const decos: Decoration[] = [];
        for (const p of ps.proposals) {
          if (p.kind === "insert_after") {
            const insertPos =
              p.afterBlockId === "TOP"
                ? 0
                : (() => {
                    const t = findBlockById(state.doc, p.afterBlockId ?? "");
                    return t ? t.pos + t.node.nodeSize : null;
                  })();
            if (insertPos === null) continue;
            decos.push(
              Decoration.widget(insertPos, () => buildPreviewWidget(p, ps.cb), {
                side: 0,
                key: `prop-${p.id}`,
              }),
            );
            continue;
          }
          const target = findBlockById(state.doc, p.blockId);
          if (!target) continue;
          if (p.kind === "replace") {
            decos.push(
              Decoration.node(target.pos, target.pos + target.node.nodeSize, {
                class: "proposal-replace",
              }),
            );
            decos.push(
              Decoration.widget(
                target.pos + target.node.nodeSize,
                () => buildPreviewWidget(p, ps.cb),
                { side: 1, key: `prop-${p.id}` },
              ),
            );
          } else if (p.kind === "delete") {
            decos.push(
              Decoration.node(target.pos, target.pos + target.node.nodeSize, {
                class: "proposal-delete",
              }),
            );
            decos.push(
              Decoration.widget(
                target.pos + target.node.nodeSize,
                () => buildChipsWidget(p, ps.cb),
                { side: 1, key: `prop-${p.id}` },
              ),
            );
          }
        }
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}

function findBlockById(doc: PMNode, id: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs?.id === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function buildPreviewWidget(p: ProposalForPlugin, cb: ProposalCallbacks): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "proposal-preview";
  wrap.dataset.proposalId = p.id;

  const preview = document.createElement("div");
  preview.className = "proposal-preview-body";
  preview.innerHTML = cb.renderContent(p.content ?? "");
  wrap.appendChild(preview);

  wrap.appendChild(buildChipsWidget(p, cb));
  return wrap;
}

function buildChipsWidget(p: ProposalForPlugin, cb: ProposalCallbacks): HTMLElement {
  const chips = document.createElement("div");
  chips.className = "proposal-chips";

  const accept = document.createElement("button");
  accept.type = "button";
  accept.textContent = "Accept";
  accept.className = "proposal-accept";
  accept.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb.onAccept(p.id);
  });

  const reject = document.createElement("button");
  reject.type = "button";
  reject.textContent = "Reject";
  reject.className = "proposal-reject";
  reject.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb.onReject(p.id);
  });

  chips.appendChild(accept);
  chips.appendChild(reject);
  return chips;
}

export function pushProposalsToView(
  view: EditorView,
  next: ProposalForPlugin[],
  cb: ProposalCallbacks,
): void {
  view.dispatch(view.state.tr.setMeta(proposalPluginKey, { proposals: next, cb }));
}
