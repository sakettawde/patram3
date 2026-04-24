import { useDocument } from "#/queries/documents";
import { DocHeader } from "./doc-header";
import { SectionList } from "./section-list";

export function DocSurface({ documentId }: { documentId: string | null }) {
  const q = useDocument(documentId);
  if (!documentId) {
    return (
      <div className="mx-auto max-w-170 px-6 pt-24 text-center text-(--sea-ink-soft)">
        <p className="font-['Fraunces',Georgia,serif] text-2xl text-[var(--sea-ink)]">
          Nothing selected yet
        </p>
        <p className="mt-2 text-sm italic opacity-80">
          Pick a document on the left, or create a new one.
        </p>
      </div>
    );
  }
  if (q.isLoading)
    return (
      <div className="mx-auto max-w-170 px-6 pt-14 text-sm text-(--sea-ink-soft)">Loading…</div>
    );
  if (q.isError || !q.data)
    return <div className="mx-auto max-w-170 px-6 pt-14 text-sm text-red-600">Failed to load.</div>;

  const wordCount = estimateWordCount(q.data.sections);
  return (
    <div className="mx-auto w-full max-w-170 px-6 pt-14 pb-20">
      <DocHeader
        document={q.data.document}
        sectionCount={q.data.sections.length}
        wordCount={wordCount}
      />
      <SectionList documentId={q.data.document.id} sections={q.data.sections} />
    </div>
  );
}

function estimateWordCount(sections: { contentText: string }[]) {
  return sections.reduce(
    (sum, s) => sum + (s.contentText.trim() ? s.contentText.trim().split(/\s+/).length : 0),
    0,
  );
}
