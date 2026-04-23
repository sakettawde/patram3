import { Editor } from "#/components/editor/editor";
import { useDocuments } from "#/stores/documents";

export function DocSurface({ onSavingChange }: { onSavingChange: (saving: boolean) => void }) {
  const doc = useDocuments((s) => (s.selectedId ? s.docs[s.selectedId] : null));
  const updateDoc = useDocuments((s) => s.updateDoc);
  const renameDoc = useDocuments((s) => s.renameDoc);

  if (!doc) {
    return (
      <div className="mx-auto max-w-[680px] px-6 pt-24 text-center text-[var(--sea-ink-soft)]">
        <p className="font-['Fraunces',Georgia,serif] text-2xl text-[var(--sea-ink)]">
          Nothing selected yet
        </p>
        <p className="mt-2 text-sm italic opacity-80">
          Pick a document on the left, or create a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[680px] px-6 pt-14 pb-20">
      <Editor
        docId={doc.id}
        initialContent={doc.contentJson}
        onUpdate={({ json, wordCount, title }) => {
          updateDoc(doc.id, { contentJson: json, wordCount });
          renameDoc(doc.id, title);
        }}
        onSavingChange={onSavingChange}
      />
    </div>
  );
}
