import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 120;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function POST(request: Request) {
  if (!anthropic) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { ideaName, username, checkins, notes, marketWatches, lang } = body;
  const isF = lang === "fr";

  const checkinsText = checkins
    .slice(0, 3)
    .map((c: any, i: number) => `Week ${i + 1}: ${c.notes || "No notes"} — Revenue: $${c.revenue}`)
    .join("\n");

  const marketText = marketWatches
    .slice(0, 1)
    .map((m: any) => m.report)
    .join("\n");

  const notesText = notes
    .slice(0, 5)
    .map((n: any) => n.content)
    .join("\n");

  const prompt = `You are Klayan — a brutal but brilliant marketing strategist helping ${username} grow "${ideaName}".

CONTEXT:
Recent check-ins: ${checkinsText || "None yet"}
Recent notes: ${notesText || "None yet"}
Market intelligence: ${marketText || "None yet"}

Generate a complete Marketing Engine report in this exact format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MARKETING ENGINE — ${ideaName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MARKETING ANGLES
01 — [Angle name]: [Hook + why it works for this specific idea]
02 — [Angle name]: [Hook + why it works for this specific idea]
03 — [Angle name]: [Hook + why it works for this specific idea]
04 — [Angle name]: [Hook + why it works for this specific idea]
05 — [Angle name]: [Hook + why it works for this specific idea]

BEST CHANNEL TO START
[One specific channel — not "social media". Be specific: Reddit r/X, cold email to Y, TikTok format Z. Why this channel first.]

FIRST PERSON TO RECRUIT
[Exact type of person, where to find them, what to offer them, why they're the right first hire/advisor for this stage]

OUTREACH MESSAGES

COLD EMAIL
Subject: [Subject line]
[3-4 line cold email body. Personalized to the idea and target customer.]

LINKEDIN DM
[2-3 line LinkedIn DM to a potential partner or advisor]

TWITTER DM
[1-2 line Twitter/X DM to a potential advisor or customer]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be specific to their idea. Use real insights from their data. Max 400 words.

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
