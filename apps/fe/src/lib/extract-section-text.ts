type PMNode = { type: string; text?: string; content?: PMNode[] };

const ATOMIC_TEXT = new Set(["hardBreak"]);

export function extractSectionText(doc: unknown): string {
  const root = doc as PMNode;
  if (!root?.content || root.content.length === 0) return "";
  return root.content.map(blockText).join("\n\n");
}

function blockText(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  if (ATOMIC_TEXT.has(node.type)) return "\n";
  if (!node.content) return "";
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    return node.content.map(blockText).join("\n");
  }
  if (node.type === "table" || node.type === "tableRow") {
    return node.content.map(blockText).join("\n");
  }
  if (node.type === "tableCell" || node.type === "tableHeader" || node.type === "listItem") {
    return node.content.map(blockText).join(" ").trim();
  }
  if (node.type === "paragraph" || node.type === "heading" || node.type === "blockquote") {
    return node.content.map(blockText).join("");
  }
  return node.content.map(blockText).join("\n\n");
}
