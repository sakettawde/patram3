import { Plus } from "lucide-react";
import { useRef } from "react";
import { nanoid } from "nanoid";
import { uploadFile } from "#/lib/assistant-api";
import { AttachmentChip, type DraftAttachment } from "./attachment-chip";

const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  ".md",
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".log",
  ".py",
  ".sh",
].join(",");

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function classifyFile(file: File): DraftAttachment["kind"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (file.size <= 1024 * 1024) return "text"; // accept any text-ish file under 1MB
  return null;
}

export function AttachmentRow({
  attachments,
  setAttachments,
}: {
  attachments: DraftAttachment[];
  setAttachments: (
    next: DraftAttachment[] | ((prev: DraftAttachment[]) => DraftAttachment[]),
  ) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  const add = async (files: FileList | null) => {
    if (!files) return;
    const accepted: DraftAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) continue;
      const kind = classifyFile(file);
      if (!kind) continue;
      const id = nanoid(6);
      const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined;
      accepted.push({
        id,
        file,
        kind,
        name: file.name,
        size: file.size,
        previewUrl,
        status: kind === "text" ? "ready" : "uploading",
      });
    }
    if (accepted.length === 0) return;
    setAttachments((prev) => [...prev, ...accepted]);

    for (const a of accepted) {
      if (a.kind === "text") {
        try {
          const content = await a.file!.text();
          setAttachments((prev) =>
            prev.map((p) => (p.id === a.id ? { ...p, content, status: "ready" } : p)),
          );
        } catch (err) {
          setAttachments((prev) =>
            prev.map((p) =>
              p.id === a.id
                ? {
                    ...p,
                    status: "error",
                    error: err instanceof Error ? err.message : "read_failed",
                  }
                : p,
            ),
          );
        }
      } else {
        try {
          const r = await uploadFile(a.file!);
          setAttachments((prev) =>
            prev.map((p) => (p.id === a.id ? { ...p, fileId: r.fileId, status: "ready" } : p)),
          );
        } catch (err) {
          setAttachments((prev) =>
            prev.map((p) =>
              p.id === a.id
                ? {
                    ...p,
                    status: "error",
                    error: err instanceof Error ? err.message : "upload_failed",
                  }
                : p,
            ),
          );
        }
      }
    }
  };

  const remove = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const retry = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target?.file) return prev;
      void add(toFileList(target.file));
      return prev.filter((p) => p.id !== id);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
      {attachments.map((a) => (
        <AttachmentChip
          key={a.id}
          attachment={a}
          onRemove={() => remove(a.id)}
          onRetry={() => retry(a.id)}
        />
      ))}
      <button
        type="button"
        aria-label="Add attachment"
        className="inline-flex h-7 items-center gap-1 rounded border border-(--rule) bg-(--paper) px-2 text-[12px] text-(--ink-faint) hover:text-(--ink)"
        onClick={() => ref.current?.click()}
      >
        <Plus className="size-3.5" />
        Attach
      </button>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function toFileList(file: File): FileList {
  const dt = new DataTransfer();
  dt.items.add(file);
  return dt.files;
}
