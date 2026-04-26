import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { nanoid } from "nanoid";

const KEY = new PluginKey("uniqueId");

// BLOCK_TYPES is the static allowlist for addGlobalAttributes (Tiptap requires
// concrete type names there). Runtime stamping in appendTransaction +
// stampMissingIds uses `node.type.isBlock`, so adding a new block extension
// without updating this list still gets ids at runtime — but those ids won't
// round-trip through data-id parseHTML/renderHTML for that type. Keep this in
// sync with the buildExtensions() roster in extensions.ts.
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
 * Return true as soon as any block node in the doc is missing an `id`.
 * Bails out on the first match — cheap to call before a full stamp walk.
 */
function hasUnstampedBlock(doc: PMNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.type.isBlock && node.type.name !== "doc" && !node.attrs.id) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Dispatch a transaction that stamps `id` attributes on any block nodes
 * in the current editor state that are missing one.  No-ops if all blocks
 * already have IDs (safe to call on every transaction).
 */
function stampMissingIds(editor: {
  state: EditorState;
  view: { dispatch: (tr: Transaction) => void };
}): void {
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
    // Tiptap reads `this.editor.options.content` *after* onBeforeCreate fires,
    // so rewriting it here propagates into the initial doc. This is undocumented
    // ordering — if a future Tiptap version reads options.content earlier, this
    // hook silently stops doing anything and tests/CI catch it (Test 1 in
    // unique-id.test.ts asserts ids on getJSON() of the initial content).
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

  onTransaction({ editor, transaction }) {
    // Fallback for unmounted editors (tests, SSR) where appendTransaction
    // is not active. In mounted editors appendTransaction already stamped ids
    // before this fires, so hasUnstampedBlock returns false after one node and
    // we skip the full restamp entirely — no full-doc walk on every keystroke.
    if (!transaction.docChanged) return;
    if (!hasUnstampedBlock(editor.state.doc)) return;
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
