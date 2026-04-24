import { useRef } from "react";
import type { Editor as TEditor } from "@tiptap/react";
import type { Section } from "#/lib/api-types";
import { SectionBlock } from "./section-block";
import { AddSectionPill } from "./add-section-pill";
import { useCreateSection } from "#/queries/sections";
import { keyBetween } from "#/lib/order-key";

// Task 28 will populate and consume this ref for focus routing.
type EditorsMap = Map<string, TEditor>;

export function SectionList({ documentId, sections }: { documentId: string; sections: Section[] }) {
  const create = useCreateSection(documentId);
  const editors = useRef<EditorsMap>(new Map());
  void editors; // placeholder until Task 28 wires focus routing

  const insertAfter = (afterIndex: number) => {
    const cur = sections[afterIndex];
    const next = sections[afterIndex + 1];
    if (!cur) return;
    const mid = keyBetween(cur.orderKey, next?.orderKey ?? null);
    create.mutate(mid ? { orderKey: mid } : {});
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
          />
          <AddSectionPill onClick={() => insertAfter(i)} />
        </div>
      ))}
    </div>
  );
}
