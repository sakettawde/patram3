import type { DocStatus } from "#/lib/domain-types";

export type DocumentsListParams = { status?: DocStatus | "all" };

export const qk = {
  me: ["me"] as const,
  documents: ["documents"] as const,
  documentsList: (params: DocumentsListParams) => ["documents", "list", params] as const,
  document: (id: string) => ["documents", "detail", id] as const,
};
