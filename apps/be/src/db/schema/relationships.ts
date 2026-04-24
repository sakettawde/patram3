import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { relationshipType } from "./enums";

export const relationships = pgTable("relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceDocumentId: uuid("source_document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  targetDocumentId: uuid("target_document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  relationshipType: relationshipType("relationship_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
