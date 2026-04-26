import { nanoid } from "nanoid";
import { useStore } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";
import { pickReply } from "#/lib/mock-replies";

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
  createSession: () => string;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string) => void;
};

export type AssistantStore = AssistantState & AssistantActions;

const REPLY_DELAY_MIN = 600;
const REPLY_DELAY_MAX = 1100;

function newSession(): ChatSession {
  const now = Date.now();
  return {
    id: nanoid(8),
    title: "New chat",
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

        createSession: () => {
          const s = newSession();
          set((st) => ({
            sessions: { ...st.sessions, [s.id]: s },
            order: [...st.order, s.id],
            selectedSessionId: s.id,
            open: true,
          }));
          return s.id;
        },

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
            return {
              sessions: nextSessions,
              order: nextOrder,
              selectedSessionId: nextSelected,
              pendingSessionIds: nextPending,
            };
          });
        },

        sendMessage: (content) => {
          const trimmed = content.trim();
          if (trimmed === "") return;
          const sid = get().selectedSessionId;
          if (!sid) return;
          const session = get().sessions[sid];
          if (!session) return;

          const userMsg: ChatMessage = {
            id: nanoid(8),
            role: "user",
            content: trimmed,
            createdAt: Date.now(),
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
            };
          });

          const delay =
            REPLY_DELAY_MIN + Math.floor(Math.random() * (REPLY_DELAY_MAX - REPLY_DELAY_MIN));

          window.setTimeout(() => {
            const cur = get().sessions[sid];
            if (!cur) {
              set((st) => {
                if (!st.pendingSessionIds[sid]) return st;
                const nextPending = { ...st.pendingSessionIds };
                delete nextPending[sid];
                return { pendingSessionIds: nextPending };
              });
              return;
            }
            const userCount = cur.messages.filter((m) => m.role === "user").length;
            const reply: ChatMessage = {
              id: nanoid(8),
              role: "assistant",
              content: pickReply(userCount - 1),
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
                    messages: [...existing.messages, reply],
                    updatedAt: reply.createdAt,
                  },
                },
                pendingSessionIds: nextPending,
              };
            });
          }, delay);
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
      },
    ),
  );
}

export const assistantStore = createAssistantStore();

export function useAssistant<T>(selector: (s: AssistantStore) => T): T {
  return useStore(assistantStore, selector);
}
