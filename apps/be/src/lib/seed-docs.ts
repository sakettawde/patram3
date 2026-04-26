import { nanoid } from "nanoid";

type SeedRow = {
  id: string;
  userId: string;
  title: string;
  emoji: string;
  tag: string | null;
  contentJson: string;
  createdAt: number;
  updatedAt: number;
};

type Block = Record<string, unknown>;

function heading(level: 1 | 2 | 3, text: string): Block {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function para(text: string): Block {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function task(text: string, checked = false): Block {
  return { type: "taskItem", attrs: { checked }, content: [para(text)] };
}
function tasks(items: Array<{ text: string; done?: boolean }>): Block {
  return { type: "taskList", content: items.map((i) => task(i.text, i.done ?? false)) };
}
function bullet(items: string[]): Block {
  return {
    type: "bulletList",
    content: items.map((t) => ({ type: "listItem", content: [para(t)] })),
  };
}
function quote(text: string): Block {
  return { type: "blockquote", content: [para(text)] };
}
function callout(emoji: string, text: string): Block {
  return { type: "callout", attrs: { emoji }, content: [para(text)] };
}

export function buildSeedDocs(userId: string, now: number): SeedRow[] {
  const rows: Array<
    Omit<SeedRow, "id" | "userId" | "createdAt" | "updatedAt"> & { offset: number }
  > = [
    {
      offset: 0,
      title: "Onboarding notes",
      emoji: "🌿",
      tag: "guide",
      contentJson: JSON.stringify({
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
      }),
    },
    {
      offset: 1,
      title: "Product principles",
      emoji: "📐",
      tag: "values",
      contentJson: JSON.stringify({
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
      }),
    },
    {
      offset: 2,
      title: "Retro — April",
      emoji: "📝",
      tag: "retro",
      contentJson: JSON.stringify({
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
      }),
    },
    {
      offset: 3,
      title: "Q2 planning",
      emoji: "🌊",
      tag: "planning",
      contentJson: JSON.stringify({
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
      }),
    },
  ];

  return rows.map((r) => ({
    id: nanoid(8),
    userId,
    title: r.title,
    emoji: r.emoji,
    tag: r.tag,
    contentJson: r.contentJson,
    createdAt: now + r.offset,
    updatedAt: now + r.offset,
  }));
}

export type { SeedRow };
