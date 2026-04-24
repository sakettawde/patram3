import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sectionKind } from "./enums";
import { documents } from "./documents";

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
});

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    orderKey: text("order_key").notNull(),
    label: text("label"),
    kind: sectionKind("kind").notNull().default("prose"),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
    contentText: text("content_text").notNull().default(""),
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', content_text)`,
    ),
    contentHash: text("content_hash").notNull(),
    frontmatter: jsonb("frontmatter")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    version: integer("version").notNull().default(1),
    ydocState: bytea("ydoc_state"),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sections_doc_order_idx").on(t.documentId, t.orderKey),
    index("sections_content_hash_idx").on(t.contentHash),
    index("sections_tsv_gin").using("gin", t.contentTsv),
  ],
);
