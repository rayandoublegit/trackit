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
  const { ideaName, username, checkins, lang } = body;
  const isF = lang === "fr";

  const revenue = checkins
    .slice(0, 5)
    .reduce((acc: number, c: any) => acc + (c.revenue ?? 0), 0);

  const prompt = `You are Klayan — a brutal pricing strategist. Help ${username} nail the pricing for "${ideaName}".

Current revenue from check-ins: $${revenue}

Generate a sharp pricing strategy report:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRICING STRATEGY — ${ideaName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${isF ? `
MODÈLE RECOMMANDÉ
[Un modèle et pourquoi]

PALIERS DE PRIX
Gratuit: [Contenu et pourquoi]
Palier 1 — [X]€/mois: [Nom + contenu]
Palier 2 — [X]€/mois: [Nom + contenu]
Palier 3 — [X]€/mois: [Nom + contenu]

ANCRES PSYCHOLOGIQUES
01 — [Astuce]
02 — [Astuce]
03 — [Astuce]

LE SEUL PRIX POUR COMMENCER
[Lequel et pourquoi]

LA PLUS GRANDE ERREUR À ÉVITER
[L'erreur n°1]
` : `
RECOMMENDED MODEL
[One model and why]

PRICING TIERS
Free: [What's included and why]
Tier 1 — $[X]/mo: [Name + what's included]
Tier 2 — $[X]/mo: [Name + what's included]
Tier 3 — $[X]/mo: [Name + what's included]

PSYCHOLOGICAL ANCHORS
01 — [Trick]
02 — [Trick]
03 — [Trick]

THE ONE PRICE TO START WITH
[Which and why]

BIGGEST MISTAKE TO AVOID
[The #1 mistake]
`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Max 300 words. Be specific to the idea.

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
