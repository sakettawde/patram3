// TODO Task 14: rebuild sidebar UX around per-doc chats (selectSessionForDoc replaces free-floating "New chat")
import { assistantStore, useAssistant } from "#/stores/assistant";
import { SessionRow } from "./session-row";
import { SidebarSection } from "./sidebar-section";

export function SessionsList() {
  const order = useAssistant((s) => s.order);
  const sessions = useAssistant((s) => s.sessions);
  const selected = useAssistant((s) => s.selectedSessionId);

  const sortedIds = [...order].sort((a, b) => {
    const da = sessions[a]?.updatedAt ?? 0;
    const db = sessions[b]?.updatedAt ?? 0;
    return db - da;
  });

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-2">
        <SidebarSection label="Sessions" count={sortedIds.length}>
          {sortedIds.map((id) => {
            const s = sessions[id];
            if (!s) return null;
            return (
              <SessionRow
                key={id}
                title={s.title}
                updatedAt={s.updatedAt}
                active={selected === id}
                onClick={() => assistantStore.getState().selectSession(id)}
                onDelete={() => assistantStore.getState().deleteSession(id)}
              />
            );
          })}
        </SidebarSection>
      </div>
    </>
  );
}
