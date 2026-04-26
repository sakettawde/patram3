import { useEffect, useMemo } from "react";
import { useUser } from "#/auth/auth-gate";
import { useDocumentsQuery } from "#/queries/documents";
import { assistantStore, useAssistant } from "#/stores/assistant";
import { useDocuments } from "#/stores/documents";
import type { DocumentRow } from "#/lib/documents-api";
import { SessionRow } from "./session-row";
import { SidebarSection } from "./sidebar-section";

export function SessionsList() {
  const user = useUser();
  const docsQuery = useDocumentsQuery(user.id);
  const order = useAssistant((s) => s.order);
  const sessions = useAssistant((s) => s.sessions);
  const selected = useAssistant((s) => s.selectedSessionId);
  const selectDoc = useDocuments((s) => s.selectDoc);

  const docsById = useMemo(() => {
    const m = new Map<string, DocumentRow>();
    for (const d of docsQuery.data ?? []) m.set(d.id, d);
    return m;
  }, [docsQuery.data]);

  // Prune sessions whose doc no longer exists.
  useEffect(() => {
    if (!docsQuery.data) return;
    for (const id of order) {
      const session = sessions[id];
      if (!session) continue;
      if (!docsById.has(session.documentId)) {
        assistantStore.getState().deleteSession(id);
      }
    }
  }, [order, sessions, docsById, docsQuery.data]);

  const sortedIds = [...order]
    .filter((id) => {
      const s = sessions[id];
      return !!s && docsById.has(s.documentId);
    })
    .sort((a, b) => {
      const da = sessions[a]?.updatedAt ?? 0;
      const db = sessions[b]?.updatedAt ?? 0;
      return db - da;
    });

  return (
    <div className="flex-1 overflow-y-auto pb-2">
      <SidebarSection label="Chats" count={sortedIds.length}>
        {sortedIds.map((id) => {
          const s = sessions[id]!;
          const docRow = docsById.get(s.documentId);
          if (!docRow) return null;
          return (
            <SessionRow
              key={id}
              title={docRow.title || "Untitled"}
              emoji={docRow.emoji}
              updatedAt={s.updatedAt}
              active={selected === id}
              onClick={() => {
                // Navigate to the doc; doc-surface's effect picks up the chat.
                selectDoc(s.documentId);
              }}
              onDelete={() => assistantStore.getState().deleteSession(id)}
            />
          );
        })}
      </SidebarSection>
    </div>
  );
}
