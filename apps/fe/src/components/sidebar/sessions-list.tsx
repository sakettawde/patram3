import { Plus } from "lucide-react";
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
      <div className="px-3 pt-1 pb-3">
        <button
          type="button"
          onClick={() => assistantStore.getState().createSession()}
          aria-label="New chat"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)"
        >
          <Plus className="size-3.5" />
          <span>New chat</span>
        </button>
      </div>

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
