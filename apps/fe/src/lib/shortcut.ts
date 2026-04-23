export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function cmdKey(): string {
  return isMac() ? "⌘" : "Ctrl";
}
