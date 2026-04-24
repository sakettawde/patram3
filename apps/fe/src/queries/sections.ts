import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";
import type { Document, Section } from "#/lib/api-types";
import type { SectionKind } from "#/lib/domain-types";
import type { MeResponse } from "#/queries/me";

type DocDetail = { document: Document; sections: Section[] };

type UpdateSectionInput = {
  contentJson?: unknown;
  label?: string | null;
  kind?: SectionKind;
  frontmatter?: Record<string, unknown>;
  orderKey?: string;
  expectedVersion?: number;
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
  id: string;
  orderKey: string;
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
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.document(documentId) });
      const previous = qc.getQueryData<DocDetail>(qk.document(documentId));
      const me = qc.getQueryData<MeResponse>(qk.me);
      const userId = me?.user.id ?? "";
      const now = new Date().toISOString();
      const optimistic: Section = {
        id: input.id,
        documentId,
        orderKey: input.orderKey,
        label: input.label ?? null,
        kind: input.kind ?? "prose",
        contentJson: input.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
        contentText: "",
        contentHash: "",
        frontmatter: input.frontmatter ?? {},
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<DocDetail>(qk.document(documentId), (prev) => {
        if (!prev) return prev;
        const next = [...prev.sections, optimistic].sort((a, b) =>
          a.orderKey.localeCompare(b.orderKey),
        );
        return { ...prev, sections: next };
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.document(documentId), ctx.previous);
      console.error("useCreateSection failed", err);
    },
    onSuccess: (real) => {
      qc.setQueryData<DocDetail>(qk.document(documentId), (prev) => {
        if (!prev) return prev;
        const swapped = prev.sections.map((s) => (s.id === real.id ? real : s));
        const found = swapped.some((s) => s.id === real.id);
        const next = (found ? swapped : [...swapped, real]).sort((a, b) =>
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
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: qk.document(args.documentId) });
      const previous = qc.getQueryData<DocDetail>(qk.document(args.documentId));
      qc.setQueryData<DocDetail>(qk.document(args.documentId), (prev) => {
        if (!prev) return prev;
        return { ...prev, sections: prev.sections.filter((s) => s.id !== args.sectionId) };
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.document(args.documentId), ctx.previous);
      console.error("useDeleteSection failed", err);
    },
  });
}

// re-export so callers can narrow the thrown error
export { ApiError };
