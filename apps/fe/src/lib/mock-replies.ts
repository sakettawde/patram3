export const MOCK_REPLIES: readonly string[] = [
  "That is a great question. Here is a thought: clarity often arrives once the constraints are written down. Try sketching the inputs and outputs before the prose.",
  "I would lean toward the simpler shape first. You can always add a layer when a real second use case shows up.",
  "Consider splitting the section into two: the why and the how. Readers tend to skim until they find their question.",
  "A few small edits could tighten this. Trim the qualifier in the opener, and let the verbs do the work.",
  "If the goal is to ship today, mark the open question as a follow-up and keep moving. Momentum is its own kind of correctness.",
  "One thread to pull on: who is the audience for this paragraph? Naming them often reshapes the surrounding sentences.",
];

export function pickReply(messageCount: number): string {
  const len = MOCK_REPLIES.length;
  if (len === 0) return "";
  const idx = ((messageCount % len) + len) % len; // safe modulo for negatives
  return MOCK_REPLIES[idx]!;
}
