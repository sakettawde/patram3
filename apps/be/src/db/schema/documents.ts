import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { docStatus, docType } from "./enums";
import { workspaces } from "./workspaces";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    emoji: text("emoji"),
    docType: docType("doc_type").notNull().default("other"),
    status: docStatus("status").notNull().default("draft"),
    parentDocumentId: uuid("parent_document_id").references((): AnyPgColumn => documents.id, {
      onDelete: "set null",
    }),
    frontmatter: jsonb("frontmatter")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_workspace_updated_idx").on(t.workspaceId, t.updatedAt.desc()),
    index("documents_workspace_status_idx").on(t.workspaceId, t.status),
    index("documents_parent_idx").on(t.parentDocumentId),
  ],
);
