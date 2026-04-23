export type FontPairing = {
  id: string;
  name: string;
  description: string;
  display: string;
  body: string;
};

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: "foundry",
    name: "Foundry",
    description: "Warm serif · clean sans",
    display: "'Fraunces', Georgia, serif",
    body: "'Manrope', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "broadsheet",
    name: "Broadsheet",
    description: "All-serif · bookish",
    display: "'Libre Caslon Text', Georgia, serif",
    body: "'Source Serif 4', Georgia, serif",
  },
  {
    id: "atelier",
    name: "Atelier",
    description: "Modern · all-sans",
    display: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "Mono-display · focus",
    display: "'JetBrains Mono', ui-monospace, monospace",
    body: "'Inter', ui-sans-serif, system-ui, sans-serif",
  },
];

export const DEFAULT_PAIRING_ID = "foundry";
const STORAGE_KEY = "patram.fonts";

export function getPairing(id: string): FontPairing {
  return FONT_PAIRINGS.find((p) => p.id === id) ?? FONT_PAIRINGS[0];
}

export function loadPairingId(): string {
  if (typeof window === "undefined") return DEFAULT_PAIRING_ID;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && FONT_PAIRINGS.some((p) => p.id === stored)) return stored;
  return DEFAULT_PAIRING_ID;
}

export function savePairingId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function applyPairing(p: FontPairing): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--font-editor-display", p.display);
  root.style.setProperty("--font-editor-body", p.body);
}
