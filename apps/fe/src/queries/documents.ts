import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { unwrap } from "#/lib/api-error";
import { qk, type DocumentsListParams } from "#/lib/query-keys";
import type { Document, Section } from "#/lib/api-types";
import type { DocStatus, DocType } from "#/lib/domain-types";

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

type CreateInput = {
  title?: string;
  emoji?: string;
  docType?: DocType;
  status?: DocStatus;
  parentDocumentId?: string | null;
};

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInput) =>
      unwrap<{ document: Document; sections: Section[] }>(
        await api.documents.$post({ json: input }),
      ),
    onSuccess: (created) => {
      qc.setQueryData(qk.document(created.document.id), created);
      qc.setQueriesData<Document[]>({ queryKey: qk.documents }, (old) => {
        if (!Array.isArray(old)) return old;
        return [created.document, ...old];
      });
    },
  });
}

type UpdateInput = Partial<
  Pick<Document, "title" | "emoji" | "docType" | "status" | "parentDocumentId" | "frontmatter">
>;

export function useUpdateDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateInput) => {
      const current = qc.getQueryData<{ document: Document; sections: Section[] }>(qk.document(id));
      const expectedUpdatedAt = current?.document.updatedAt ?? new Date(0).toISOString();
      return unwrap<Document>(
        await api.documents[":id"].$patch({
          param: { id },
          json: { ...patch, expectedUpdatedAt },
        }),
      );
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.document(id) });
      const prev = qc.getQueryData<{ document: Document; sections: Section[] }>(qk.document(id));
      if (prev) {
        qc.setQueryData(qk.document(id), { ...prev, document: { ...prev.document, ...patch } });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.document(id), ctx.prev);
    },
    onSuccess: (doc) => {
      const cached = qc.getQueryData<{ document: Document; sections: Section[] }>(qk.document(id));
      if (cached) qc.setQueryData(qk.document(id), { ...cached, document: doc });
      qc.setQueriesData<Document[]>({ queryKey: qk.documents }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((d) => (d.id === id ? doc : d));
      });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ ok: true }>(await api.documents[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => {
      qc.removeQueries({ queryKey: qk.document(id) });
      qc.setQueriesData<Document[]>({ queryKey: qk.documents }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((d) => d.id !== id);
      });
    },
  });
}
