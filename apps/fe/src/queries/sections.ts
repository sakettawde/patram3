import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";
import type { Document, Section } from "#/lib/api-types";
import type { SectionKind } from "#/lib/domain-types";

type DocDetail = { document: Document; sections: Section[] };

type UpdateSectionInput = {
  contentJson?: unknown;
  label?: string | null;
  kind?: SectionKind;
  frontmatter?: Record<string, unknown>;
  orderKey?: string;
  expectedVersion: number;
};

export function useUpdateSection(args: { sectionId: string; documentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSectionInput) =>
      unwrap<Section>(
        await api.sections[":id"].$patch({
          param: { id: args.sectionId },
          json: input,
        }),
      ),
    onSuccess: (updated) => {
      qc.setQueryData<DocDetail>(qk.document(args.documentId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((s) => (s.id === updated.id ? updated : s)),
        };
      });
    },
  });
}

type CreateSectionInput = {
  orderKey?: string;
  kind?: SectionKind;
  contentJson?: unknown;
  label?: string | null;
  frontmatter?: Record<string, unknown>;
};

export function useCreateSection(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSectionInput) =>
      unwrap<Section>(
        await api.documents[":docId"].sections.$post({
          param: { docId: documentId },
          json: input,
        }),
      ),
    onSuccess: (created) => {
      qc.setQueryData<DocDetail>(qk.document(documentId), (prev) => {
        if (!prev) return prev;
        const next = [...prev.sections, created].sort((a, b) =>
          a.orderKey.localeCompare(b.orderKey),
        );
        return { ...prev, sections: next };
      });
    },
  });
}

export function useDeleteSection(args: { sectionId: string; documentId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap<{ ok: true }>(await api.sections[":id"].$delete({ param: { id: args.sectionId } })),
    onSuccess: () => {
      qc.setQueryData<DocDetail>(qk.document(args.documentId), (prev) => {
        if (!prev) return prev;
        return { ...prev, sections: prev.sections.filter((s) => s.id !== args.sectionId) };
      });
    },
  });
}

// re-export so callers can narrow the thrown error
export { ApiError };
