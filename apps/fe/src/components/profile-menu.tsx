import { useState } from "react";
import { useUser } from "#/auth/auth-gate";
import { USER_ID_STORAGE_KEY } from "#/auth/types";

type View = "default" | "confirm-logout";

export function ProfileMenu() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("default");
  const [copied, setCopied] = useState(false);

  const onToggleOpen = () => {
    setOpen((v) => {
      const next = !v;
      // Reset to default view whenever the dropdown closes, so reopening it
      // doesn't leave the user staring at the confirm prompt.
      if (!next) setView("default");
      return next;
    });
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fail silently; the code is also visible in the menu.
    }
  };

  const onConfirmLogout = () => {
    window.localStorage.removeItem(USER_ID_STORAGE_KEY);
    window.location.reload();
  };

  return (
    <div className="relative mt-auto border-t border-(--rule)">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onToggleOpen}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[12px] text-(--ink-soft) hover:bg-(--paper-soft)"
      >
        <span className="truncate">{user.name}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Profile"
          className="absolute right-3 bottom-12 left-3 rounded-md border border-(--rule) bg-(--paper) p-3 shadow-md"
        >
          {view === "default" ? (
            <>
              <p className="text-[11px] text-(--ink-faint)">Your patram code</p>
              <p className="mt-1 break-all font-mono text-[12px] text-(--ink)">{user.id}</p>
              <p className="mt-2 text-[11px] text-(--ink-faint)">
                Save this to use patram on another device.
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setView("confirm-logout")}
                  className="text-[12px] text-(--ink-faint) underline-offset-2 hover:text-(--ink-soft) hover:underline"
                >
                  Log out
                </button>
                <button
                  type="button"
                  onClick={onCopy}
                  className="rounded-md border border-(--rule) px-2 py-1 text-[12px] text-(--ink-soft) hover:bg-(--paper-soft)"
                >
                  {copied ? "Copied" : "Copy code"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12px] font-medium text-(--ink)">Log out of this device?</p>
              <p className="mt-1 text-[11px] text-(--ink-faint)">
                You'll need your code to come back.
              </p>
              <p className="mt-2 break-all font-mono text-[12px] text-(--ink)">{user.id}</p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onCopy}
                  className="rounded-md border border-(--rule) px-2 py-1 text-[12px] text-(--ink-soft) hover:bg-(--paper-soft)"
                >
                  {copied ? "Copied" : "Copy code"}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setView("default")}
                  className="rounded-md px-2 py-1 text-[12px] text-(--ink-soft) hover:bg-(--paper-soft)"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirmLogout}
                  className="rounded-md border border-(--rule) px-2 py-1 text-[12px] text-destructive hover:bg-(--paper-soft)"
                >
                  Confirm log out
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
