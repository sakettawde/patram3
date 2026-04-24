import { useRef, useState } from "react";
import type { Editor as TEditor } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { SectionBlock } from "./section-block";
import { AddSectionPill } from "./add-section-pill";
import { useCreateSection } from "#/queries/sections";
import { keyBetween } from "#/lib/order-key";

type EditorsMap = Map<string, TEditor>;

export function SectionList({ documentId, sections }: { documentId: string; sections: Section[] }) {
  const create = useCreateSection(documentId);
  const editors = useRef<EditorsMap>(new Map());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const focusSection = (id: string, where: "start" | "end") => {
    const ed = editors.current.get(id);
    if (!ed) return;
    ed.commands.focus(where);
  };

  const insertAfter = (afterIndex: number) => {
    const cur = sections[afterIndex];
    if (!cur) return;
    const next = sections[afterIndex + 1];
    const orderKey = keyBetween(cur.orderKey, next?.orderKey ?? null);
    const id = crypto.randomUUID();
    setPendingFocusId(id);
    create.mutate({ id, orderKey });
  };

  const handleEditorReady = (id: string, ed: TEditor) => {
    editors.current.set(id, ed);
    if (id === pendingFocusId) {
      ed.commands.focus("start");
      setPendingFocusId(null);
    }
  };

  return (
    <div className="flex flex-col">
      {sections.map((s, i) => (
        <div key={s.id} className="flex flex-col">
          <SectionBlock
            section={s}
            documentId={documentId}
            isOnlySection={sections.length === 1}
            onRequestAddBelow={() => insertAfter(i)}
            onEditorReady={handleEditorReady}
            onFocusPrev={() => {
              const prev = sections[i - 1];
              if (prev) focusSection(prev.id, "end");
            }}
            onFocusNext={() => {
              const nextSec = sections[i + 1];
              if (nextSec) focusSection(nextSec.id, "start");
            }}
          />
          <AddSectionPill onClick={() => insertAfter(i)} />
        </div>
      ))}
    </div>
  );
}
