import type { DocStatus, DocType, SectionKind } from "./domain-types";

export type Document = {
  id: string;
  workspaceId: string;
  title: string;
  emoji: string | null;
  docType: DocType;
  status: DocStatus;
  parentDocumentId: string | null;
  frontmatter: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Section = {
  id: string;
  documentId: string;
  orderKey: string;
  label: string | null;
  kind: SectionKind;
  contentJson: unknown;
  contentText: string;
  contentHash: string;
  frontmatter: Record<string, unknown>;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};
