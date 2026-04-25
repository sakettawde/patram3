import { Editor } from "#/components/editor/editor";
import { useDocuments } from "#/stores/documents";

export function DocSurface({ onSavingChange }: { onSavingChange: (saving: boolean) => void }) {
  const doc = useDocuments((s) => (s.selectedId ? s.docs[s.selectedId] : null));
  const updateDoc = useDocuments((s) => s.updateDoc);
  const renameDoc = useDocuments((s) => s.renameDoc);

  if (!doc) {
    return (
      <div className="mx-auto max-w-170 px-6 pt-32 text-center text-[14px] text-(--ink-faint)">
        No document selected
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-170 px-6 pt-20 pb-24">
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
