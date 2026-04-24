export function SectionConflictBanner({
  onCopyEdits,
  onDiscardAndReload,
}: {
  onCopyEdits: () => void;
  onDiscardAndReload: () => void;
}) {
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border border-[#d9a441] bg-[#fff7e8] p-3 text-[12.5px] text-[var(--sea-ink)]">
      <div>
        <strong>This section was changed elsewhere.</strong>
        <br />
        Your unsaved edits are kept locally until you decide.
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCopyEdits}
          className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-[11.5px] font-semibold text-[var(--sea-ink)] hover:bg-[rgb(79_184_178_/_0.06)]"
        >
          Copy my edits
        </button>
        <button
          onClick={onDiscardAndReload}
          className="rounded-md bg-[var(--lagoon-deep)] px-2 py-1 text-[11.5px] font-semibold text-white"
        >
          Discard &amp; reload
        </button>
      </div>
    </div>
  );
}
