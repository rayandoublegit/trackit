import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function POST(request: Request) {
  if (!anthropic) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { ideaName, originalVerdict, checkins, notes, username, lang } = body;
  const isF = lang === "fr";

  const checkinsText = checkins
    .slice(0, 5)
    .map((c: any, i: number) => `Week ${i + 1}: ${c.notes || "No notes"} — Build days: ${c.build_days}, Users talked to: ${c.users_count}, Revenue: $${c.revenue}`)
    .join("\n");

  const notesText = notes
    .slice(0, 10)
    .map((n: any) => n.content)
    .join("\n");

  const prompt = `You are Klayan — a brutal AI co-founder running a Pivot Radar scan for ${username} who is building "${ideaName}".

ORIGINAL VERDICT CONTEXT:
${originalVerdict ?? "No original verdict available"}

RECENT CHECK-INS:
${checkinsText || "No check-ins yet"}

RECENT NOTES:
${notesText || "No notes yet"}

Analyze if ${username} is drifting from what the market actually validated. Look for:
1. Are they building features nobody asked for?
2. Are they avoiding the hard customer conversations?
3. Is their focus shifting away from the core problem?
4. Are they spending more time on product than distribution?
5. Any signs of premature scaling or premature optimization?

Generate a Pivot Radar report in this exact format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIVOT RADAR — ${username.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${isF ? `
SCORE DE DÉRIVE: [1-10]

CE QUE TU CONSTRUIS VS CE QUE LE MARCHÉ VEUT
[2-3 phrases]

SIGNAUX DE DÉRIVE DÉTECTÉS
01 — [Signal spécifique]
02 — [Signal spécifique]
03 — [Signal spécifique]

ALERTE PIVOT
[Recommandation si score 6+]

CONTINUE COMME ÇA
[Ce qui va bien]
` : `
DRIFT SCORE: [1-10]

WHAT YOU'RE BUILDING vs WHAT THE MARKET WANTS
[2-3 sentences]

DRIFT SIGNALS DETECTED
01 — [Specific signal]
02 — [Specific signal]
03 — [Specific signal]

PIVOT WARNING
[Recommendation if score 6+]

STAY THE COURSE
[What they're doing right]
`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be direct. Use their actual data. Max 300 words.

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
