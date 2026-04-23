const EMOJIS = [
  "📝",
  "🌊",
  "🌿",
  "📐",
  "💡",
  "🗒️",
  "📖",
  "🎯",
  "🧭",
  "🏖️",
  "🪴",
  "🧪",
  "🔭",
  "🗂️",
  "🕯️",
  "🧩",
  "🔖",
  "📎",
  "✍️",
  "☕",
  "🎨",
  "🧵",
  "🌱",
  "⚓",
];

export function EmojiPalette({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1 p-2">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="aspect-square rounded-md text-xl transition hover:bg-[color:rgb(79_184_178_/_0.14)] active:scale-90"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
