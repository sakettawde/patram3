import { useDocument } from "#/queries/documents";

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
  return <div className="mx-auto max-w-170 px-6 pt-14 pb-20">TODO: render doc</div>;
}
