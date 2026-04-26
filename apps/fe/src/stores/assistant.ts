import { nanoid } from "nanoid";
import { useStore } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";
import * as api from "#/lib/assistant-api";

export type ChatRole = "user" | "assistant";

export type AttachmentMeta =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; size: number };

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  attachments?: AttachmentMeta[];
};

export type ChatSession = {
  id: string;
  title: string;
  documentId: string; // required — sessions always belong to a document
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  anthropicSessionId: string | null;
  environmentId: string | null;
};

export type StreamingActivity = {
  id: string;
  kind: "tool_use" | "tool_result" | "thinking" | "status";
  label: string;
  summary?: string;
  at: number;
};

export type StreamingSlot = {
  sessionId: string;
  messageId: string;
  text: string;
  activity: StreamingActivity[];
  status: "streaming" | "cancelled" | "error";
  errorMessage?: string;
};

export type AssistantState = {
  open: boolean;
  selectedSessionId: string | null;
  sessions: Record<string, ChatSession>;
  order: string[];
  pendingSessionIds: Record<string, true>;
  streaming: StreamingSlot | null;
};

export type AssistantActions = {
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  selectSessionForDoc: (docId: string) => void;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string, attachments?: AttachmentMeta[]) => Promise<void>;
  cancelStreaming: () => void;
  retryLastTurn: () => Promise<void>;
};

export type AssistantStore = AssistantState & AssistantActions;

// Per-session AbortControllers for in-flight stream requests.
const streamControllers = new Map<string, AbortController>();

function newSession(documentId: string): ChatSession {
  const now = Date.now();
  return {
    id: nanoid(8),
    title: "New chat",
    documentId,
    messages: [],
    createdAt: now,
    updatedAt: now,
    anthropicSessionId: null,
    environmentId: null,
  };
}

function truncateForTitle(content: string, max = 60): string {
  const trimmed = content.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

// Structural shape used at the boundary; composer may pass a `content`
// field on text-kind attachments which is not part of AttachmentMeta.
type IncomingAttachment =
  | { kind: "image" | "pdf"; fileId: string; name: string; size: number }
  | { kind: "text"; name: string; size: number; content?: string };

function toApiAttachments(items: IncomingAttachment[]): api.Attachment[] {
  return items.map((a) => {
    if (a.kind === "text") {
      const content = (a as { content?: string }).content ?? "";
      return { kind: "text", name: a.name, content };
    }
    return { kind: a.kind, fileId: a.fileId, name: a.name, size: a.size };
  });
}

function toStoredAttachments(items: IncomingAttachment[]): AttachmentMeta[] {
  return items.map((a) => {
    if (a.kind === "text") {
      return { kind: "text", name: a.name, size: a.size };
    }
    return { kind: a.kind, fileId: a.fileId, name: a.name, size: a.size };
  });
}

export function createAssistantStore(): StoreApi<AssistantStore> {
  return createStore<AssistantStore>()(
    persist(
      (set, get) => ({
        open: false,
        selectedSessionId: null,
        sessions: {},
        order: [],
        pendingSessionIds: {},
        streaming: null,

        toggleOpen: () => set((st) => ({ open: !st.open })),
        setOpen: (open) => set({ open }),

        selectSessionForDoc: (docId: string) =>
          set((state) => {
            const existing = state.order.find((id) => state.sessions[id]?.documentId === docId);
            if (existing) return { selectedSessionId: existing, open: state.open };
            const session = newSession(docId);
            return {
              sessions: { ...state.sessions, [session.id]: session },
              order: [...state.order, session.id],
              selectedSessionId: session.id,
              open: true,
            };
          }),

        selectSession: (id) => {
          if (!get().sessions[id]) return;
          set({ selectedSessionId: id, open: true });
        },

        renameSession: (id, title) => {
          const clean = title.trim();
          set((st) => {
            const existing = st.sessions[id];
            if (!existing) return st;
            return {
              sessions: {
                ...st.sessions,
                [id]: {
                  ...existing,
                  title: clean === "" ? "New chat" : clean,
                  updatedAt: Date.now(),
                },
              },
            };
          });
        },

        deleteSession: (id) => {
          const ac = streamControllers.get(id);
          if (ac) {
            ac.abort();
            streamControllers.delete(id);
          }
          set((st) => {
            if (!st.sessions[id]) return st;
            const nextSessions = { ...st.sessions };
            delete nextSessions[id];
            const nextOrder = st.order.filter((x) => x !== id);
            const nextPending = { ...st.pendingSessionIds };
            delete nextPending[id];
            const wasSelected = st.selectedSessionId === id;
            const nextSelected = wasSelected
              ? (nextOrder
                  .slice()
                  .sort(
                    (a, b) => (nextSessions[b]?.updatedAt ?? 0) - (nextSessions[a]?.updatedAt ?? 0),
                  )[0] ?? null)
              : st.selectedSessionId;
            const nextStreaming = st.streaming?.sessionId === id ? null : st.streaming;
            return {
              sessions: nextSessions,
              order: nextOrder,
              selectedSessionId: nextSelected,
              pendingSessionIds: nextPending,
              streaming: nextStreaming,
            };
          });
        },

        sendMessage: async (content, attachments) => {
          const trimmed = content.trim();
          if (trimmed === "") return;
          const sid = get().selectedSessionId;
          if (!sid) return;
          const session = get().sessions[sid];
          if (!session) return;

          const incoming = (attachments ?? []) as IncomingAttachment[];

          // 1) Lazy bootstrap the Anthropic session.
          let anthropicSessionId = session.anthropicSessionId;
          let environmentId = session.environmentId;
          if (!anthropicSessionId || !environmentId) {
            try {
              const created = await api.createSession();
              anthropicSessionId = created.sessionId;
              environmentId = created.environmentId;
              set((st) => {
                const existing = st.sessions[sid];
                if (!existing) return st;
                return {
                  sessions: {
                    ...st.sessions,
                    [sid]: {
                      ...existing,
                      anthropicSessionId,
                      environmentId,
                    },
                  },
                };
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              set({
                streaming: {
                  sessionId: sid,
                  messageId: "",
                  text: "",
                  activity: [],
                  status: "error",
                  errorMessage: msg,
                },
              });
              return;
            }
          }

          // 2) Optimistically append the user message.
          const storedAttachments = toStoredAttachments(incoming);
          const userMsg: ChatMessage = {
            id: nanoid(8),
            role: "user",
            content: trimmed,
            createdAt: Date.now(),
            ...(storedAttachments.length > 0 ? { attachments: storedAttachments } : {}),
          };

          const isFirstUserMessage = session.messages.length === 0;

          set((st) => {
            const existing = st.sessions[sid];
            if (!existing) return st;
            return {
              sessions: {
                ...st.sessions,
                [sid]: {
                  ...existing,
                  messages: [...existing.messages, userMsg],
                  title: isFirstUserMessage ? truncateForTitle(trimmed) : existing.title,
                  updatedAt: userMsg.createdAt,
                },
              },
              pendingSessionIds: { ...st.pendingSessionIds, [sid]: true },
              // 3) Initialize the streaming slot.
              streaming: {
                sessionId: sid,
                messageId: "",
                text: "",
                activity: [],
                status: "streaming",
              },
            };
          });

          // Set up AbortController for this stream.
          const ac = new AbortController();
          streamControllers.set(sid, ac);

          try {
            const apiAttachments = toApiAttachments(incoming);
            const body: api.SendBody = {
              text: trimmed,
              attachments: apiAttachments,
              environmentId: environmentId!,
              documentId: session.documentId,
            };

            await api.streamMessage(anthropicSessionId!, body, {
              signal: ac.signal,
              onEvent: (e) => {
                if (e.type === "message_start") {
                  set((st) => {
                    if (!st.streaming || st.streaming.sessionId !== sid) return st;
                    return {
                      streaming: { ...st.streaming, messageId: e.id },
                    };
                  });
                } else if (e.type === "text_delta") {
                  set((st) => {
                    if (!st.streaming || st.streaming.sessionId !== sid) return st;
                    return {
                      streaming: {
                        ...st.streaming,
                        text: st.streaming.text + e.delta,
                      },
                    };
                  });
                } else if (e.type === "activity") {
                  set((st) => {
                    if (!st.streaming || st.streaming.sessionId !== sid) return st;
                    const entry: StreamingActivity = {
                      id: nanoid(8),
                      kind: e.kind,
                      label: e.label,
                      summary: e.summary,
                      at: Date.now(),
                    };
                    return {
                      streaming: {
                        ...st.streaming,
                        activity: [...st.streaming.activity, entry],
                      },
                    };
                  });
                } else if (e.type === "message_end") {
                  const cur = get();
                  const slot = cur.streaming;
                  if (!slot || slot.sessionId !== sid) return;
                  const msg: ChatMessage = {
                    id: slot.messageId || nanoid(8),
                    role: "assistant",
                    content: slot.text,
                    createdAt: Date.now(),
                  };
                  set((st) => {
                    const existing = st.sessions[sid];
                    if (!existing) return st;
                    const nextPending = { ...st.pendingSessionIds };
                    delete nextPending[sid];
                    return {
                      sessions: {
                        ...st.sessions,
                        [sid]: {
                          ...existing,
                          messages: [...existing.messages, msg],
                          updatedAt: msg.createdAt,
                        },
                      },
                      pendingSessionIds: nextPending,
                      streaming: null,
                    };
                  });
                } else if (e.type === "error") {
                  set((st) => {
                    if (!st.streaming || st.streaming.sessionId !== sid) return st;
                    return {
                      streaming: {
                        ...st.streaming,
                        status: "error",
                        errorMessage: e.message,
                      },
                    };
                  });
                }
              },
            });
          } catch (err) {
            const cur = get();
            const slot = cur.streaming;
            // If we already marked cancelled, leave the partial message handling
            // to cancelStreaming. Otherwise, treat this as an error.
            if (slot && slot.sessionId === sid && slot.status !== "cancelled") {
              const msg = err instanceof Error ? err.message : String(err);
              set((st) => {
                if (!st.streaming || st.streaming.sessionId !== sid) return st;
                return {
                  streaming: {
                    ...st.streaming,
                    status: "error",
                    errorMessage: msg,
                  },
                };
              });
            }
          } finally {
            // Only delete our controller if it's still the active one
            // (a subsequent sendMessage may have installed a fresh controller).
            if (streamControllers.get(sid) === ac) {
              streamControllers.delete(sid);
            }
            set((st) => {
              if (!st.pendingSessionIds[sid]) return st;
              const nextPending = { ...st.pendingSessionIds };
              delete nextPending[sid];
              return { pendingSessionIds: nextPending };
            });
          }
        },

        cancelStreaming: () => {
          const sid = get().selectedSessionId;
          if (!sid) return;
          const slot = get().streaming;
          if (!slot || slot.sessionId !== sid) return;

          // Commit any partial text as a final assistant message (status cancelled).
          const partial = slot.text;
          const messageId = slot.messageId || nanoid(8);
          set((st) => {
            const existing = st.sessions[sid];
            if (!existing) return st;
            const nextMessages =
              partial.length > 0
                ? [
                    ...existing.messages,
                    {
                      id: messageId,
                      role: "assistant" as const,
                      content: partial,
                      createdAt: Date.now(),
                    },
                  ]
                : existing.messages;
            return {
              sessions: {
                ...st.sessions,
                [sid]: {
                  ...existing,
                  messages: nextMessages,
                  updatedAt: Date.now(),
                },
              },
              streaming: null,
            };
          });

          // Abort the in-flight fetch.
          const ac = streamControllers.get(sid);
          if (ac) {
            ac.abort();
            streamControllers.delete(sid);
          }

          // Fire-and-forget remote cancel.
          const session = get().sessions[sid];
          const asid = session?.anthropicSessionId;
          if (asid) {
            void api.cancel(asid);
          }
        },

        retryLastTurn: async () => {
          await get().sendMessage("Please continue.");
        },
      }),
      {
        name: "patram.assistant.v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({
          open: s.open,
          selectedSessionId: s.selectedSessionId,
          sessions: s.sessions,
          order: s.order,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          const validIds = state.order.filter((id) => {
            const s = state.sessions[id];
            return !!s && typeof s.documentId === "string" && s.documentId.length > 0;
          });
          state.order = validIds;
          state.sessions = Object.fromEntries(validIds.map((id) => [id, state.sessions[id]!]));
          if (state.selectedSessionId && !state.sessions[state.selectedSessionId]) {
            state.selectedSessionId = null;
          }
        },
      },
    ),
  );
}

export const assistantStore = createAssistantStore();

export function useAssistant<T>(selector: (s: AssistantStore) => T): T {
  return useStore(assistantStore, selector);
}
