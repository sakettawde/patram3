#!/usr/bin/env tsx
/**
 * One-time (idempotent) script: configures the Anthropic Managed Agent
 * referenced by ANTHROPIC_AGENT_ID with the three propose_* custom tools and
 * appends a system-prompt section explaining the doc-injection contract.
 *
 * Usage (from repo root):
 *   vp exec tsx apps/be/scripts/configure-agent-tools.ts
 *
 * Or with explicit env:
 *   ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_AGENT_ID=ag_... \
 *     vp exec tsx apps/be/scripts/configure-agent-tools.ts
 *
 * If env vars aren't set, the script reads apps/be/.dev.vars as a fallback.
 *
 * Re-running is safe: existing propose_* tools are filtered out before the
 * three are re-added, and the system-prompt section is replaced (matched by
 * its sentinel comment).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_SENTINEL_BEGIN = "<!-- patram:propose-tools BEGIN -->";
const SYSTEM_SENTINEL_END = "<!-- patram:propose-tools END -->";

const SYSTEM_SECTION = `${SYSTEM_SENTINEL_BEGIN}
You are a writing assistant embedded in a document editor (Patram).

On every user turn you receive the active document as a Markdown context block delimited by \`--- BEGIN DOCUMENT ---\` and \`--- END DOCUMENT ---\`. Each top-level block in the document is preceded by an HTML comment carrying its id, like \`<!-- id:abc123 -->\`. The id is a short, opaque token — quote it back exactly when calling tools.

When the user asks for changes to the document, **do not describe the changes in prose** — call the propose tools instead. The user reviews each proposal as an inline diff and accepts or rejects.

Available tools:
- \`propose_replace_block(block_id, new_content_markdown)\` — overwrite an existing block. The new content is Markdown.
- \`propose_insert_block_after(after_block_id, new_content_markdown)\` — insert a new block. Pass the literal \`TOP\` as \`after_block_id\` to insert at the start of the document.
- \`propose_delete_block(block_id)\` — delete a block.

You can fire multiple proposals in one turn. After the user accepts or rejects, you'll see the updated document on the next turn.

Keep replies concise. The user sees the proposed edits inline; don't repeat them in chat. A short summary of what you changed (and why, if non-obvious) is enough.
${SYSTEM_SENTINEL_END}`;

const PROPOSE_TOOLS = [
  {
    type: "custom" as const,
    name: "propose_replace_block",
    description:
      "Propose replacing the contents of an existing block in the document. The user reviews the diff and accepts or rejects. Use this for rewrites, edits, and rewordings.",
    input_schema: {
      type: "object" as const,
      properties: {
        block_id: {
          type: "string",
          description:
            "Id of the block to replace. Take this from the `<!-- id:X -->` comment preceding the block in the document context.",
        },
        new_content_markdown: {
          type: "string",
          description:
            "Replacement contents in Markdown. A single block (paragraph, heading, list, etc.) — do not include the id comment.",
        },
      },
      required: ["block_id", "new_content_markdown"],
    },
  },
  {
    type: "custom" as const,
    name: "propose_insert_block_after",
    description:
      "Propose inserting a new block after an existing one. The user reviews the addition and accepts or rejects. Use this to add new sections, paragraphs, or list items.",
    input_schema: {
      type: "object" as const,
      properties: {
        after_block_id: {
          type: "string",
          description:
            'Id of the block to insert after. Pass the literal string "TOP" to insert at the very start of the document.',
        },
        new_content_markdown: {
          type: "string",
          description:
            "New block contents in Markdown. A single block — do not include the id comment.",
        },
      },
      required: ["after_block_id", "new_content_markdown"],
    },
  },
  {
    type: "custom" as const,
    name: "propose_delete_block",
    description:
      "Propose deleting a block from the document. The user reviews and accepts or rejects.",
    input_schema: {
      type: "object" as const,
      properties: {
        block_id: {
          type: "string",
          description:
            "Id of the block to delete. Take this from the `<!-- id:X -->` comment preceding the block in the document context.",
        },
      },
      required: ["block_id"],
    },
  },
];

function loadEnvFromDevVars(): Record<string, string> {
  try {
    const path = resolve(import.meta.dirname, "..", ".dev.vars");
    const text = readFileSync(path, "utf8");
    const vars: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      vars[key] = value.replace(/^["']|["']$/g, "");
    }
    return vars;
  } catch {
    return {};
  }
}

function mergeSystemPrompt(existing: string | null | undefined): string {
  const base = existing ?? "";
  const beginIdx = base.indexOf(SYSTEM_SENTINEL_BEGIN);
  const endIdx = base.indexOf(SYSTEM_SENTINEL_END);
  if (beginIdx >= 0 && endIdx > beginIdx) {
    // Replace the existing section in-place.
    const before = base.slice(0, beginIdx).replace(/\s+$/, "");
    const after = base.slice(endIdx + SYSTEM_SENTINEL_END.length).replace(/^\s+/, "");
    return [before, SYSTEM_SECTION, after].filter((s) => s.length > 0).join("\n\n");
  }
  // Append the section if not present.
  return base.length > 0 ? `${base.trim()}\n\n${SYSTEM_SECTION}` : SYSTEM_SECTION;
}

async function main() {
  const fallback = loadEnvFromDevVars();
  const apiKey = process.env.ANTHROPIC_API_KEY ?? fallback.ANTHROPIC_API_KEY;
  const agentId = process.env.ANTHROPIC_AGENT_ID ?? fallback.ANTHROPIC_AGENT_ID;
  if (!apiKey) {
    console.error("Missing ANTHROPIC_API_KEY (env var or apps/be/.dev.vars).");
    process.exit(1);
  }
  if (!agentId) {
    console.error("Missing ANTHROPIC_AGENT_ID (env var or apps/be/.dev.vars).");
    process.exit(1);
  }

  const client = new Anthropic({
    apiKey,
    defaultHeaders: { "anthropic-beta": "managed-agents-2026-04-01" },
  });

  console.log(`Fetching agent ${agentId}…`);
  const current = await client.beta.agents.retrieve(agentId);
  console.log(`  name: ${current.name}`);
  console.log(`  version: ${current.version}`);
  console.log(`  current tool count: ${current.tools.length}`);

  const proposeNames = new Set(PROPOSE_TOOLS.map((t) => t.name));
  const preserved = current.tools.filter((t) => {
    if (t.type !== "custom") return true;
    return !proposeNames.has(t.name);
  });
  const nextTools = [...preserved, ...PROPOSE_TOOLS];
  console.log(`  preserved (non-propose) tools: ${preserved.length}`);
  console.log(`  installing propose_* tools: ${PROPOSE_TOOLS.length}`);
  console.log(`  next tool count: ${nextTools.length}`);

  const nextSystem = mergeSystemPrompt(current.system);
  const systemChanged = nextSystem !== (current.system ?? "");
  console.log(`  system prompt: ${systemChanged ? "updated" : "unchanged"}`);

  console.log("Updating agent…");
  const updated = await client.beta.agents.update(agentId, {
    version: current.version,
    // Note: SDK types narrow params more tightly than the runtime accepts.
    // Cast to unknown then to the params type so we can pass our concrete tools.
    tools: nextTools as unknown as Parameters<typeof client.beta.agents.update>[1]["tools"],
    system: nextSystem,
  });
  console.log(`Done. New version: ${updated.version}, tool count: ${updated.tools.length}`);
}

main().catch((err) => {
  console.error("Failed to configure agent:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
