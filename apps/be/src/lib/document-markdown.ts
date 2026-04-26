import { nanoid } from "nanoid";

type JSONNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export function documentJsonToMarkdown(doc: JSONNode): string {
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return "";
  const out: string[] = [];
  for (const block of doc.content) {
    const id = (typeof block.attrs?.id === "string" && block.attrs.id) || nanoid(8);
    out.push(`<!-- id:${id} -->`);
    out.push(renderBlock(block));
    out.push("");
  }
  return out.join("\n");
}

function renderBlock(node: JSONNode): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${renderInline(node.content)}`;
    }
    case "paragraph":
      return renderInline(node.content);
    case "bulletList":
      return (node.content ?? [])
        .map((li) => `- ${renderInline(extractListItemPara(li))}`)
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ${renderInline(extractListItemPara(li))}`)
        .join("\n");
    case "taskList":
      return (node.content ?? [])
        .map((li) => {
          const checked = li.attrs?.checked === true ? "x" : " ";
          return `- [${checked}] ${renderInline(extractListItemPara(li))}`;
        })
        .join("\n");
    case "blockquote":
      return (node.content ?? []).map((c) => `> ${renderBlock(c)}`).join("\n");
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return ["```" + lang, renderInline(node.content), "```"].join("\n");
    }
    case "horizontalRule":
      return "---";
    case "callout": {
      const tone = typeof node.attrs?.tone === "string" ? node.attrs.tone : "info";
      return `> [!${tone}]\n> ${(node.content ?? []).map(renderBlock).join("\n> ")}`;
    }
    default:
      return renderInline(node.content);
  }
}

function extractListItemPara(li: JSONNode): JSONNode["content"] {
  // listItem wraps a paragraph; pull its inline content out. Nested lists or
  // other block children are silently dropped — v1 doesn't render them.
  return (li.content ?? []).find((c) => c.type === "paragraph")?.content ?? [];
}

function renderInline(nodes: JSONNode["content"]): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text") return applyMarks(n.text ?? "", n.marks ?? []);
      if (n.type === "hardBreak") return "  \n";
      return renderInline(n.content);
    })
    .join("");
}

function applyMarks(text: string, marks: NonNullable<JSONNode["marks"]>): string {
  let out = text;
  for (const m of marks) {
    switch (m.type) {
      case "bold":
        out = `**${out}**`;
        break;
      case "italic":
        out = `*${out}*`;
        break;
      case "code":
        out = `\`${out}\``;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "link": {
        const href = typeof m.attrs?.href === "string" ? m.attrs.href : "";
        out = `[${out}](${href})`;
        break;
      }
    }
  }
  return out;
}
