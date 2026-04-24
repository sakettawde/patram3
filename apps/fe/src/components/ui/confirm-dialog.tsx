import * as React from "react";

import { cn } from "#/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

type Tone = "neutral" | "destructive";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => void;
}) {
  const confirmBtn = cn(
    "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold tracking-tight",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-strong)]",
    tone === "destructive"
      ? "bg-[#b1402a] text-white hover:bg-[#9a3723] focus-visible:ring-[rgb(177_64_42/0.45)]"
      : "bg-[var(--sea-ink)] text-white hover:bg-[var(--sea-ink-soft)] focus-visible:ring-[rgb(50_143_151/0.45)]",
  );

  const cancelBtn = cn(
    "inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium",
    "text-[var(--sea-ink-soft)] transition-colors",
    "hover:bg-[rgb(79_184_178/0.12)] hover:text-[var(--sea-ink)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(50_143_151/0.35)]",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <button type="button" className={cancelBtn} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmBtn}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            autoFocus
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
