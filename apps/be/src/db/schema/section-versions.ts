import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { changedByType } from "./enums";
import { sections } from "./sections";

export const sectionVersions = pgTable(
  "section_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    contentJson: jsonb("content_json").notNull(),
    contentText: text("content_text").notNull(),
    contentHash: text("content_hash").notNull(),
    label: text("label"),
    changeSummary: text("change_summary"),
    changedBy: text("changed_by").notNull(),
    changedByType: changedByType("changed_by_type").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("section_versions_section_number_idx").on(t.sectionId, t.versionNumber),
    index("section_versions_section_number_desc_idx").on(t.sectionId, t.versionNumber.desc()),
  ],
);
