import { useQuery } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { unwrap } from "#/lib/api-error";
import { qk, type DocumentsListParams } from "#/lib/query-keys";
import type { Document, Section } from "#/lib/api-types";

export function useDocumentsList(params: DocumentsListParams) {
  return useQuery({
    queryKey: qk.documentsList(params),
    queryFn: async () => {
      const query = params.status && params.status !== "all" ? { status: params.status } : {};
      return unwrap<Document[]>(await api.documents.$get({ query }));
    },
    staleTime: 5_000,
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: qk.document(id ?? "__none__"),
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("unreachable");
      return unwrap<{ document: Document; sections: Section[] }>(
        await api.documents[":id"].$get({ param: { id } }),
      );
    },
    staleTime: 10_000,
  });
}
