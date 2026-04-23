import type { JSONContent } from "@tiptap/react";
import type { Doc, DocumentsState } from "#/stores/documents";
import { nanoid } from "nanoid";

function heading(level: 1 | 2 | 3, text: string): JSONContent {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function task(text: string, checked = false): JSONContent {
  return {
    type: "taskItem",
    attrs: { checked },
    content: [para(text)],
  };
}
function tasks(items: Array<{ text: string; done?: boolean }>): JSONContent {
  return { type: "taskList", content: items.map((i) => task(i.text, i.done ?? false)) };
}
function bullet(items: string[]): JSONContent {
  return {
    type: "bulletList",
    content: items.map((t) => ({ type: "listItem", content: [para(t)] })),
  };
}
function quote(text: string): JSONContent {
  return { type: "blockquote", content: [para(text)] };
}
function callout(emoji: string, text: string): JSONContent {
  return {
    type: "callout",
    attrs: { emoji },
    content: [para(text)],
  };
}

function doc(partial: Partial<Doc> & Pick<Doc, "title" | "emoji" | "contentJson">): Doc {
  return {
    id: nanoid(8),
    title: partial.title,
    emoji: partial.emoji,
    tag: partial.tag ?? null,
    contentJson: partial.contentJson,
    wordCount: partial.wordCount ?? 0,
    updatedAt: partial.updatedAt ?? Date.now(),
    pinned: partial.pinned ?? false,
  };
}

export function seedDocuments(): DocumentsState {
  const now = Date.now();
  const list: Doc[] = [
    doc({
      title: "Onboarding notes",
      emoji: "🌿",
      pinned: true,
      tag: "guide",
      updatedAt: now - 60 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Onboarding notes"),
          para("Welcome to Patram. These notes collect the little rituals we keep returning to."),
          heading(2, "First week"),
          tasks([
            { text: "Read the product principles", done: true },
            { text: "Pair with a teammate on a real ticket" },
            { text: "Write your first retro" },
          ]),
        ],
      },
    }),
    doc({
      title: "Product principles",
      emoji: "📐",
      pinned: true,
      tag: "values",
      updatedAt: now - 3 * 60 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Product principles"),
          quote("Ship calm software. The fewer surprises, the better."),
          bullet([
            "Respect the reader's attention.",
            "Defaults should make the next sentence easier.",
            "Small delights, never loud ones.",
          ]),
        ],
      },
    }),
    doc({
      title: "Retro — April",
      emoji: "📝",
      tag: "retro",
      updatedAt: now - 20 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Retro — April"),
          heading(2, "Went well"),
          tasks([
            { text: "Landed the slash menu prototype", done: true },
            { text: "Found a cleaner approach for the bubble menu", done: true },
          ]),
          heading(2, "To improve"),
          tasks([{ text: "Cut scope earlier when a week slips" }]),
          callout("💡", "The fastest improvement is often the one you already agreed to."),
        ],
      },
    }),
    doc({
      title: "Q2 planning",
      emoji: "🌊",
      tag: "planning",
      updatedAt: now - 2 * 60_000,
      contentJson: {
        type: "doc",
        content: [
          heading(1, "Q2 planning"),
          para(
            "This is the space where the team drafts the plan for the next quarter. The writing experience stays out of your way — there is no toolbar above. Select any text to reveal a floating bubble menu, or hit / on a new line for the slash menu.",
          ),
          callout("💡", "Goal. Ship the document editor before the planning offsite on April 30."),
          heading(2, "Top priorities"),
          tasks([
            { text: "Confirm the palette and typography direction", done: true },
            { text: "Wire slash commands for headings, lists, quote, callout" },
            { text: "Design the empty state" },
          ]),
          heading(2, "Open questions"),
          para(""),
        ],
      },
    }),
  ];

  const docs: Record<string, Doc> = {};
  const order: string[] = [];
  for (const d of list) {
    docs[d.id] = d;
    order.push(d.id);
  }
  return { docs, order, selectedId: order[order.length - 1] ?? null };
}
