import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { nanoid } from "nanoid";

const KEY = new PluginKey("uniqueId");

const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "callout",
];

const BLOCK_TYPE_SET = new Set(BLOCK_TYPES);

/**
 * Recursively stamp missing `id` attributes on block nodes in a JSON content tree.
 * Used during editor initialisation before the ProseMirror document is created.
 */
function stampJsonContent(node: Record<string, unknown>): Record<string, unknown> {
  if (!node || typeof node !== "object") return node;

  if (BLOCK_TYPE_SET.has(node.type as string)) {
    const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};
    if (!attrs.id) {
      node = { ...node, attrs: { ...attrs, id: nanoid(8) } };
    }
  }

  if (Array.isArray(node.content)) {
    node = {
      ...node,
      content: (node.content as Record<string, unknown>[]).map(stampJsonContent),
    };
  }

  return node;
}

/**
 * Dispatch a transaction that stamps `id` attributes on any block nodes
 * in the current editor state that are missing one.  No-ops if all blocks
 * already have IDs (safe to call on every transaction).
 */
function stampMissingIds(editor: {
  state: import("@tiptap/pm/state").EditorState;
  view: { dispatch: (tr: import("@tiptap/pm/state").Transaction) => void };
}): void {
  let needsStamp = false;
  editor.state.doc.descendants((node) => {
    if (!node.type.isBlock || node.type.name === "doc") return;
    if (!node.attrs.id) needsStamp = true;
  });
  if (!needsStamp) return;

  const tr = editor.state.tr;
  let modified = false;
  editor.state.doc.descendants((node, pos) => {
    if (!node.type.isBlock || node.type.name === "doc") return;
    if (node.attrs.id) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: nanoid(8) });
    modified = true;
  });
  if (modified) {
    editor.view.dispatch(tr);
  }
}

/**
 * UniqueID extension — stamps a stable 8-character nanoid `id` attribute on
 * every block-level node.  IDs round-trip through `getJSON()` so they survive
 * autosave and reload.
 *
 * Stamping happens in two places:
 *  1. `onBeforeCreate` — pre-processes the initial JSON content so that the
 *     very first `getJSON()` call already returns IDs (works even when the
 *     editor is not mounted to a DOM element, e.g. in unit tests).
 *  2. `appendTransaction` ProseMirror plugin — stamps any block nodes that
 *     arrive without an ID during normal editing when the editor is mounted.
 *  3. `onTransaction` — fallback for the unmounted case (tests / SSR): fires
 *     after each transaction and dispatches a follow-up stamp transaction when
 *     `appendTransaction` is not active.
 */
export const UniqueID = Extension.create({
  name: "uniqueId",

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-id"),
            renderHTML: (attrs) => (attrs.id ? { "data-id": attrs.id } : {}),
            keepOnSplit: false,
          },
        },
      },
    ];
  },

  onBeforeCreate() {
    // Pre-stamp the JSON content option so the initial doc already has IDs.
    // This runs synchronously before createDoc(), ensuring getJSON() returns
    // IDs even on an unmounted editor.
    const content = this.editor.options.content as unknown;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      this.editor.options.content = stampJsonContent(
        content as Record<string, unknown>,
      ) as typeof this.editor.options.content;
    } else if (Array.isArray(content)) {
      this.editor.options.content = (content as Record<string, unknown>[]).map(
        stampJsonContent,
      ) as typeof this.editor.options.content;
    }
  },

  onTransaction({ editor }) {
    // Fallback for unmounted editors (tests, SSR) where appendTransaction
    // is not active. In mounted editors appendTransaction handles this and
    // the guard below exits immediately (all nodes already have IDs).
    stampMissingIds(editor);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        appendTransaction: (_transactions, _oldState, newState) => {
          // Primary stamping mechanism for mounted editors.
          const tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (!node.type.isBlock) return;
            if (node.type.name === "doc") return;
            if (node.attrs.id) return;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: nanoid(8) });
            modified = true;
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
