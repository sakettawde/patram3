import { useNavigate } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { useUser } from "#/auth/auth-gate";
import { useCreateDoc } from "#/queries/documents";
import { assistantStore } from "#/stores/assistant";
import { useDocuments } from "#/stores/documents";

export function SidebarHeaderActions() {
  const user = useUser();
  const selectDoc = useDocuments((s) => s.selectDoc);
  const createDoc = useCreateDoc(user.id);
  const navigate = useNavigate();
  const pending = createDoc.isPending;

  const onNewChat = async () => {
    const row = await createDoc.mutateAsync({});
    selectDoc(row.id);
    assistantStore.getState().setOpen(true);
    void navigate({ to: "/" });
  };

  const onNewDoc = async () => {
    const row = await createDoc.mutateAsync({});
    selectDoc(row.id);
    void navigate({ to: "/" });
  };

  return (
    <div className="flex flex-col gap-1.5 px-3 pt-1 pb-3">
      <button
        type="button"
        onClick={onNewChat}
        disabled={pending}
        aria-label="New chat"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-(--ink) px-3 py-2 text-[13px] font-medium text-(--paper) shadow-sm transition hover:bg-(--ink-soft) disabled:opacity-60"
      >
        <Sparkles className="size-3.5" />
        <span>New chat</span>
      </button>
      <button
        type="button"
        onClick={onNewDoc}
        disabled={pending}
        aria-label="New document"
        className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-(--ink-soft) transition hover:bg-(--paper-soft) hover:text-(--ink) disabled:opacity-60"
      >
        <Plus className="size-3.5" />
        <span>New document</span>
      </button>
    </div>
  );
}
