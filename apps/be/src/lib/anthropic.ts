import Anthropic from "@anthropic-ai/sdk";

// SDK v0.91.1 automatically injects `anthropic-beta: managed-agents-2026-04-01` on
// all client.beta.{sessions,environments,agents}.*  calls — no defaultHeaders needed.

export function getClient(env: CloudflareBindings): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export function getAgentId(env: CloudflareBindings): string {
  return env.ANTHROPIC_AGENT_ID;
}
