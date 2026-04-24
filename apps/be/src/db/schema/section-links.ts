import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { sections } from "./sections";

export const sectionLinks = pgTable(
  "section_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSectionId: uuid("source_section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    targetDocumentId: uuid("target_document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    targetSectionId: uuid("target_section_id").references(() => sections.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("section_links_src_doc_section_idx").on(
      t.sourceSectionId,
      t.targetDocumentId,
      t.targetSectionId,
    ),
    index("section_links_src_idx").on(t.sourceSectionId),
    index("section_links_target_idx").on(t.targetDocumentId, t.targetSectionId),
  ],
);
