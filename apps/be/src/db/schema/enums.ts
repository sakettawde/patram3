import { pgEnum } from "drizzle-orm/pg-core";

export const workspaceRole = pgEnum("workspace_role", ["owner", "editor", "viewer"]);
export const docType = pgEnum("doc_type", ["prd", "strategy", "spec", "rfc", "other"]);
export const docStatus = pgEnum("doc_status", ["draft", "review", "published", "archived"]);
export const sectionKind = pgEnum("section_kind", [
  "prose",
  "list",
  "table",
  "code",
  "callout",
  "embed",
]);
export const changedByType = pgEnum("changed_by_type", ["user", "agent"]);
export const commentThreadStatus = pgEnum("comment_thread_status", ["open", "resolved"]);
export const suggestionType = pgEnum("suggestion_type", [
  "insert",
  "delete",
  "replace",
  "rewrite_section",
]);
export const suggestionStatus = pgEnum("suggestion_status", [
  "pending",
  "accepted",
  "rejected",
  "superseded",
]);
export const relationshipType = pgEnum("relationship_type", [
  "related",
  "supersedes",
  "superseded_by",
  "derived_from",
]);
