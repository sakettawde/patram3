import { useEffect, useRef, useState } from "react";
import type { Document } from "#/lib/api-types";
import { DocEmoji } from "#/components/doc/doc-emoji";
import { formatRelativeTime } from "#/lib/format-time";
import { useUpdateDocument } from "#/queries/documents";

export function DocHeader({
  document,
  sectionCount,
  wordCount,
}: {
  document: Document;
  sectionCount: number;
  wordCount: number;
}) {
  const update = useUpdateDocument(document.id);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const [editingLocal, setEditingLocal] = useState<string | null>(null);

  // Reconcile server -> DOM only when not focused.
  useEffect(() => {
    if (titleRef.current && window.document.activeElement !== titleRef.current) {
      titleRef.current.textContent = document.title;
    }
  }, [document.title]);

  const save = (value: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      update.mutate({ title: value.trim() || "Untitled" });
      setEditingLocal(null);
    }, 600);
  };

  return (
    <header className="flex flex-col gap-3 pb-6">
      <DocEmoji emoji={document.emoji ?? "📝"} onChange={(emoji) => update.mutate({ emoji })} />
      <div
        ref={titleRef}
        role="textbox"
        aria-label="Document title"
        contentEditable
        suppressContentEditableWarning
        className="font-['Fraunces',Georgia,serif] text-[38px] leading-[1.1] tracking-[-0.02em] text-[var(--sea-ink)] outline-none empty:before:italic empty:before:text-[color:rgb(65_97_102_/_0.6)] empty:before:content-['Untitled_—_but_full_of_potential']"
        onInput={(e) => {
          const v = (e.target as HTMLDivElement).textContent ?? "";
          setEditingLocal(v);
          save(v);
        }}
        onBlur={(e) => {
          if (timer.current) window.clearTimeout(timer.current);
          update.mutate({ title: (e.target as HTMLDivElement).textContent?.trim() || "Untitled" });
          setEditingLocal(null);
        }}
      >
        {document.title}
      </div>
      <div className="text-[12px] text-[var(--sea-ink-soft)]">
        Edited {formatRelativeTime(new Date(document.updatedAt).getTime())} · {sectionCount} section
        {sectionCount === 1 ? "" : "s"} · {wordCount} word{wordCount === 1 ? "" : "s"}
      </div>
      <span hidden aria-hidden>
        {editingLocal}
      </span>
    </header>
  );
}
