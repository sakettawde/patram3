import { marked } from "marked";

export function markdownToHtml(md: string): string {
  // Strip our own `<!-- id:X -->` markers — they're for the agent, not for rendering.
  const cleaned = md.replace(/<!--\s*id:[^>]*-->\s*\n?/g, "");
  return marked.parse(cleaned, { async: false }) as string;
}
