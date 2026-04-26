import { useState } from "react";
import { useUser } from "#/auth/auth-gate";

export function ProfileMenu() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fail silently; the code is also visible in the menu.
    }
  };

  return (
    <div className="relative mt-auto border-t border-(--rule)">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
          <p className="text-[11px] text-(--ink-faint)">Your patram code</p>
          <p className="mt-1 break-all font-mono text-[12px] text-(--ink)">{user.id}</p>
          <p className="mt-2 text-[11px] text-(--ink-faint)">
            Save this to use patram on another device.
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onCopy}
              className="rounded-md border border-(--rule) px-2 py-1 text-[12px] text-(--ink-soft) hover:bg-(--paper-soft)"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
