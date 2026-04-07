import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const PLAYBOOKS: Record<string, string> = {
  first_user: "FIRST USER PLAYBOOK",
  first_dollar: "FIRST DOLLAR PLAYBOOK",
  "1k_mrr": "$1K MRR PLAYBOOK",
  "10k_mrr": "$10K MRR PLAYBOOK",
};

export async function POST(request: Request) {
  if (!anthropic) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { type, ideaName, username, lang } = body;
  const isF = lang === "fr";

  const milestoneLabel = PLAYBOOKS[type] ?? "MILESTONE";

  const prompt = `You are Klayan — a brutal but fair AI co-founder. ${username} just hit a major milestone building "${ideaName}".

MILESTONE ACHIEVED: ${milestoneLabel}

Generate a specific, actionable playbook for this exact stage. Format:
${isF ? `
CE QUE ÇA SIGNIFIE
[1-2 phrases]

TES 5 PROCHAINS MOUVEMENTS
01 — [Action spécifique]
02 — [Action spécifique]
03 — [Action spécifique]
04 — [Action spécifique]
05 — [Action spécifique]

LE PIÈGE À ÉVITER
[Le piège n°1]

CE QUI SE DÉBLOQUE ENSUITE
[Ce sur quoi se concentrer]
` : `
WHAT THIS MEANS
[1-2 sentences]

YOUR NEXT 5 MOVES
01 — [Specific action]
02 — [Specific action]
03 — [Specific action]
04 — [Specific action]
05 — [Specific action]

THE TRAP TO AVOID
[The #1 mistake]

WHAT UNLOCKS NEXT
[What to focus on next]
`}

Be specific to their idea. Not generic startup advice. Max 250 words.

IMPORTANT: Always finish your last sentence completely. Never cut off mid-word or mid-sentence. If you are running out of space, wrap up with a complete concluding sentence.
${isF ? `
CRITICAL: Respond ENTIRELY in French. ALL section headers, ALL content, ALL labels must be in French. Keep the exact same structure but translate everything. Never write a single word in English.` : `
CRITICAL: Respond entirely in English.`}`;

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const playbook = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return NextResponse.json({ playbook });
}
