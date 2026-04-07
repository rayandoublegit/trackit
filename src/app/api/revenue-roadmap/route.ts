import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function POST(request: Request) {
  if (!anthropic) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { ideaName, username, checkins, milestones, lang } = body;
  const isF = lang === "fr";

  const currentRevenue = checkins
    .slice(0, 5)
    .reduce((acc: number, c: any) => acc + (c.revenue ?? 0), 0);

  const achievedMilestones = milestones
    .filter((m: any) => m.achieved_at)
    .map((m: any) => m.type)
    .join(", ");

  const prompt = `You are Klayan — a revenue growth strategist. Help ${username} build "${ideaName}" from $${currentRevenue} to $10K MRR.

Achieved milestones: ${achievedMilestones || "None yet"}

Generate a concrete revenue roadmap:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REVENUE ROADMAP — ${ideaName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CURRENT STAGE
[Assess where ${username} is right now based on revenue and milestones]

PHASE 1 — $0 TO $1K MRR
Timeline: [X weeks]
01 — [Specific action]
02 — [Specific action]
03 — [Specific action]
Key metric to hit: [One number to track]

PHASE 2 — $1K TO $5K MRR
Timeline: [X weeks]
01 — [Specific action]
02 — [Specific action]
03 — [Specific action]
Key metric to hit: [One number to track]

PHASE 3 — $5K TO $10K MRR
Timeline: [X weeks]
01 — [Specific action]
02 — [Specific action]
03 — [Specific action]
Key metric to hit: [One number to track]

THE ONE THING
[The single highest leverage action ${username} should do this week]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be specific to the idea. Max 350 words.

IMPORTANT: Always finish your last sentence completely. Never cut off mid-word or mid-sentence. If you are running out of space, wrap up with a complete concluding sentence.
${isF ? `
CRITICAL: Respond ENTIRELY in French. ALL section headers, ALL content, ALL labels must be in French. Keep the exact same structure but translate everything. Never write a single word in English.` : `
CRITICAL: Respond entirely in English.`}`;

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const report = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return NextResponse.json({ report });
}
