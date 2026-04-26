import { api } from "./api";
import type { JSONContent } from "@tiptap/react";

export type DocumentRow = {
  id: string;
  userId: string;
  title: string;
  emoji: string;
  tag: string | null;
  contentJson: string;
  createdAt: number;
  updatedAt: number;
};

export type DocPatch = Partial<{
  title: string;
  emoji: string;
  tag: string | null;
  contentJson: JSONContent;
}>;

function authHeaders(userId: string): Record<string, string> {
  return { "X-User-Id": userId };
}

export const documentsApi = {
  list: (userId: string) => api.get<DocumentRow[]>("/documents", { headers: authHeaders(userId) }),
  create: (userId: string, input: DocPatch) =>
    api.post<DocumentRow>("/documents", input, { headers: authHeaders(userId) }),
  update: (userId: string, id: string, patch: DocPatch) =>
    api.patch<DocumentRow>(`/documents/${id}`, patch, { headers: authHeaders(userId) }),
  remove: (userId: string, id: string) =>
    api.del<void>(`/documents/${id}`, { headers: authHeaders(userId) }),
};
