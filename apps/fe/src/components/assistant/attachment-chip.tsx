import { FileText, Image as ImageIcon, RotateCw, X } from "lucide-react";
import { cn } from "#/lib/utils";

export type DraftAttachment = {
  id: string;
  file?: File;
  kind: "image" | "pdf" | "text";
  name: string;
  size: number;
  fileId?: string;
  content?: string;
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChip({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: DraftAttachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const failed = attachment.status === "error";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded border bg-(--paper) px-2 py-1 text-[12px]",
        failed ? "border-red-400" : "border-(--rule)",
      )}
    >
      {attachment.kind === "image" && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="size-7 rounded object-cover"
        />
      ) : attachment.kind === "image" ? (
        <ImageIcon className="size-4 text-(--ink-faint)" />
      ) : (
        <FileText className="size-4 text-(--ink-faint)" />
      )}
      <div className="flex flex-col">
        <span className="max-w-40 truncate text-(--ink)">{attachment.name}</span>
        <span className="text-(--ink-faint)">
          {attachment.status === "uploading"
            ? "Uploading…"
            : failed
              ? "Failed"
              : formatSize(attachment.size)}
        </span>
      </div>
      {failed && (
        <button
          type="button"
          aria-label="Retry upload"
          className="text-(--ink-faint) hover:text-(--ink)"
          onClick={onRetry}
        >
          <RotateCw className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label={`Remove ${attachment.name}`}
        className="text-(--ink-faint) hover:text-(--ink)"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
