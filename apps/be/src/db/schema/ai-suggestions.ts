import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { suggestionStatus, suggestionType } from "./enums";
import { sections } from "./sections";

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    sectionVersionAtCreation: integer("section_version_at_creation").notNull(),
    suggestionType: suggestionType("suggestion_type").notNull(),
    anchorFrom: integer("anchor_from").notNull(),
    anchorTo: integer("anchor_to").notNull(),
    anchorText: text("anchor_text").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    rationale: text("rationale"),
    status: suggestionStatus("status").notNull().default("pending"),
    createdByAgent: text("created_by_agent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("ai_suggestions_section_status_idx").on(t.sectionId, t.status)],
);
