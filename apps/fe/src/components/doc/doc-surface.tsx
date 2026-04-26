import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useUser } from "#/auth/auth-gate";
import { Editor } from "#/components/editor/editor";
import { useDocumentsQuery, useUpdateDoc } from "#/queries/documents";
import { useDocuments } from "#/stores/documents";
import type { JSONContent } from "@tiptap/react";

type SaveState = "idle" | "saving";

export function DocSurface({ onSavingChange }: { onSavingChange: (saving: boolean) => void }) {
  const user = useUser();
  const selectedId = useDocuments((s) => s.selectedId);
  const selectDoc = useDocuments((s) => s.selectDoc);
  const query = useDocumentsQuery(user.id);

  // When the list lands and nothing is selected (fresh load, or after the
  // selected doc was deleted), default to the most recently created doc.
  useEffect(() => {
    if (selectedId !== null) return;
    const list = query.data;
    if (!list || list.length === 0) return;
    selectDoc(list[list.length - 1].id);
  }, [query.data, selectedId, selectDoc]);

  const doc = useMemo(
    () => query.data?.find((d) => d.id === selectedId) ?? null,
    [query.data, selectedId],
  );

  const updater = useUpdateDoc(user.id, doc?.id ?? null);
  const saveState = useSyncExternalStore<SaveState>(
    updater.subscribe,
    updater.getState,
    () => "idle",
  );
  useEffect(() => {
    onSavingChange(saveState === "saving");
  }, [saveState, onSavingChange]);

  // Flush on tab close / route change.
  useEffect(() => {
    const onBeforeUnload = () => {
      void updater.flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void updater.flush();
    };
  }, [updater]);

  // Track the last sent title heading to avoid scheduling no-op patches.
  const [lastSent, setLastSent] = useState<{ titleHeading: string }>({ titleHeading: "" });

  if (!doc) {
    return (
      <div className="mx-auto max-w-170 px-6 pt-32 text-center text-[14px] text-(--ink-faint)">
        {query.isPending ? "Loading…" : "No document selected"}
      </div>
    );
  }

  const initial: JSONContent = JSON.parse(doc.contentJson);

  return (
    <div className="mx-auto w-full max-w-170 px-6 pt-20 pb-24">
      <Editor
        docId={doc.id}
        initialContent={initial}
        onChange={({ json, title }) => {
          const patch: { contentJson: JSONContent; title?: string } = { contentJson: json };
          if (title && title !== lastSent.titleHeading) {
            patch.title = title;
            setLastSent({ titleHeading: title });
          }
          updater.schedule(patch);
        }}
        onBlur={() => {
          void updater.flush();
        }}
      />
    </div>
  );
}
