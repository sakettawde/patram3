export type LinkTuple = {
  targetDocumentId: string;
  targetSectionId: string | null;
};

type PMMark = { type: string; attrs?: { docId?: string; sectionId?: string } };
type PMNode = {
  type: string;
  marks?: PMMark[];
  content?: PMNode[];
};

export function extractLinks(doc: unknown): LinkTuple[] {
  const seen = new Set<string>();
  const out: LinkTuple[] = [];
  walk(doc as PMNode, (node) => {
    for (const mark of node.marks ?? []) {
      if (mark.type !== "docLink") continue;
      const docId = mark.attrs?.docId;
      if (!docId) continue;
      const sectionId = mark.attrs?.sectionId ?? null;
      const key = `${docId}|${sectionId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ targetDocumentId: docId, targetSectionId: sectionId });
    }
  });
  return out;
}

function walk(node: PMNode, visit: (n: PMNode) => void) {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}
