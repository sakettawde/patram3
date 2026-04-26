import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { assistantStore, useAssistant } from "#/stores/assistant";
import { Composer } from "./composer";
import { MessageList } from "./message-list";

export function AssistantPanel() {
  const open = useAssistant((s) => s.open);
  const sessionId = useAssistant((s) => s.selectedSessionId);
  const session = useAssistant((s) =>
    s.selectedSessionId ? s.sessions[s.selectedSessionId] : null,
  );
  const sendMessage = useAssistant((s) => s.sendMessage);
  const cancelStreaming = useAssistant((s) => s.cancelStreaming);
  const streaming = useAssistant((s) => s.streaming);

  // Auto-create a session on first open if none exists.
  useEffect(() => {
    if (open && !sessionId) {
      assistantStore.getState().createSession();
    }
  }, [open, sessionId]);

  if (!session || !sessionId) {
    return <PanelChrome />;
  }

  const isStreaming = streaming?.sessionId === sessionId && streaming?.status === "streaming";

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        sessionId={sessionId}
        title={session.title}
        onClose={() => assistantStore.getState().setOpen(false)}
      />
      <MessageList session={session} />
      <Composer
        disabled={!sessionId}
        streaming={isStreaming}
        onSend={(text, attachments) => void sendMessage(text, attachments)}
        onStop={cancelStreaming}
      />
    </div>
  );
}

function PanelChrome() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center border-b border-(--rule) px-4" />
    </div>
  );
}

function PanelHeader({
  sessionId,
  title,
  onClose,
}: {
  sessionId: string;
  title: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  // Reset draft when session or external title changes.
  useEffect(() => {
    setDraft(title);
    setEditing(false);
  }, [sessionId, title]);

  const commit = () => {
    assistantStore.getState().renameSession(sessionId, draft);
    setEditing(false);
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-(--rule) px-4">
      {editing ? (
        <input
          autoFocus
          aria-label="Session title"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="flex-1 bg-transparent text-[13px] font-medium text-(--ink) focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename session"
          className="flex-1 truncate text-left text-[13px] font-medium text-(--ink) hover:text-(--ink-soft)"
        >
          {title}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close assistant"
        className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-(--ink-faint) hover:bg-(--paper-soft) hover:text-(--ink-soft)"
      >
        <X className="size-3.5" />
      </button>
    </header>
  );
}
