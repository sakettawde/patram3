CREATE TYPE "public"."changed_by_type" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."comment_thread_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('draft', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('prd', 'strategy', 'spec', 'rfc', 'other');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('related', 'supersedes', 'superseded_by', 'derived_from');--> statement-breakpoint
CREATE TYPE "public"."section_kind" AS ENUM('prose', 'list', 'table', 'code', 'callout', 'embed');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('insert', 'delete', 'replace', 'rewrite_section');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"emoji" text,
	"doc_type" "doc_type" DEFAULT 'other' NOT NULL,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"parent_document_id" uuid,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"order_key" text NOT NULL,
	"label" text,
	"kind" "section_kind" DEFAULT 'prose' NOT NULL,
	"content_json" jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content_text)) STORED,
	"content_hash" text NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"ydoc_state" "bytea",
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_json" jsonb NOT NULL,
	"content_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"label" text,
	"change_summary" text,
	"changed_by" text NOT NULL,
	"changed_by_type" "changed_by_type" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_section_id" uuid NOT NULL,
	"target_document_id" uuid NOT NULL,
	"target_section_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"status" "comment_thread_status" DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"section_version_at_creation" integer NOT NULL,
	"suggestion_type" "suggestion_type" NOT NULL,
	"anchor_from" integer NOT NULL,
	"anchor_to" integer NOT NULL,
	"anchor_text" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"rationale" text,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_by_agent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"target_document_id" uuid NOT NULL,
	"relationship_type" "relationship_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_document_id_documents_id_fk" FOREIGN KEY ("parent_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_versions" ADD CONSTRAINT "section_versions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_source_section_id_sections_id_fk" FOREIGN KEY ("source_section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_target_document_id_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_target_section_id_sections_id_fk" FOREIGN KEY ("target_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_thread_id_comment_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_document_id_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_workspace_updated_idx" ON "documents" USING btree ("workspace_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_workspace_status_idx" ON "documents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "documents_parent_idx" ON "documents" USING btree ("parent_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_doc_order_idx" ON "sections" USING btree ("document_id","order_key");--> statement-breakpoint
CREATE INDEX "sections_content_hash_idx" ON "sections" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "sections_tsv_gin" ON "sections" USING gin ("content_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "section_versions_section_number_idx" ON "section_versions" USING btree ("section_id","version_number");--> statement-breakpoint
CREATE INDEX "section_versions_section_number_desc_idx" ON "section_versions" USING btree ("section_id","version_number" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "section_links_src_doc_section_idx" ON "section_links" USING btree ("source_section_id","target_document_id","target_section_id");--> statement-breakpoint
CREATE INDEX "section_links_src_idx" ON "section_links" USING btree ("source_section_id");--> statement-breakpoint
CREATE INDEX "section_links_target_idx" ON "section_links" USING btree ("target_document_id","target_section_id");--> statement-breakpoint
CREATE INDEX "comment_threads_section_status_idx" ON "comment_threads" USING btree ("section_id","status");--> statement-breakpoint
CREATE INDEX "comments_thread_created_idx" ON "comments" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_suggestions_section_status_idx" ON "ai_suggestions" USING btree ("section_id","status");