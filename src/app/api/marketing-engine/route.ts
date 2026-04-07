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

${isF ? `
ANGLES MARKETING
01 — [Nom]: [Hook + pourquoi ça marche]
02 — [Nom]: [Hook + pourquoi ça marche]
03 — [Nom]: [Hook + pourquoi ça marche]
04 — [Nom]: [Hook + pourquoi ça marche]
05 — [Nom]: [Hook + pourquoi ça marche]

MEILLEUR CANAL POUR COMMENCER
[Un canal spécifique et pourquoi]

PREMIÈRE PERSONNE À RECRUTER
[Type exact, où la trouver, quoi proposer]

MESSAGES DE PROSPECTION

EMAIL FROID
Objet: [Ligne d'objet]
[Corps 3-4 lignes]

MESSAGE LINKEDIN
[2-3 lignes]

MESSAGE TWITTER
[1-2 lignes]
` : `
MARKETING ANGLES
01 — [Angle name]: [Hook + why it works]
02 — [Angle name]: [Hook + why it works]
03 — [Angle name]: [Hook + why it works]
04 — [Angle name]: [Hook + why it works]
05 — [Angle name]: [Hook + why it works]

BEST CHANNEL TO START
[One specific channel and why]

FIRST PERSON TO RECRUIT
[Exact type, where to find, what to offer]

OUTREACH MESSAGES

COLD EMAIL
Subject: [Subject line]
[Body 3-4 lines]

LINKEDIN DM
[2-3 lines]

TWITTER DM
[1-2 lines]
`}

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
