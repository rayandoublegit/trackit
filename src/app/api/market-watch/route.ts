import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

export async function POST(request: Request) {
  if (!anthropic || !supabaseAdmin) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { projectId, userId, ideaName, originalVerdict, lang } = body;
  const isF = lang === "fr";

  const prompt = `You are Klayan — an AI co-founder doing a monthly market intelligence scan for a founder building a product called "${ideaName}". Do NOT ask for clarification. Search the web immediately for competitors, market trends, and customer complaints in the space this product operates in. Make your best inference about the market based on the product name and search broadly.

Search the web RIGHT NOW for the latest market developments. Find:
1. Any new competitors launched in the last 30 days
2. New customer complaints on Reddit about existing competitors
3. Any funding rounds or acquisitions in this space
4. Any pricing changes from competitors
5. Any new market trends or shifts

Generate a Competitor Pulse report:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KLAYAN MARKET WATCH — ${ideaName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${isF ? `
NOUVEAUX CONCURRENTS DÉTECTÉS
[Nouveaux entrants ou "Aucun nouveau concurrent ce mois-ci."]

FAIBLESSES DES CONCURRENTS CE MOIS
[Nouvelles plaintes clients trouvées]

MOUVEMENTS DE MARCHÉ
[Levées de fonds, acquisitions, changements de prix]

SIGNAL D'OPPORTUNITÉ
[La plus grande opportunité ce mois-ci]

ACTION CE MOIS
[Une chose spécifique à faire]
` : `
NEW COMPETITORS DETECTED
[New players or "No new competitors detected this month."]

COMPETITOR WEAKNESSES THIS MONTH
[New complaints found]

MARKET MOVEMENTS
[Funding, acquisitions, pricing changes]

OPPORTUNITY SIGNAL
[Biggest opportunity this month]

ACTION THIS MONTH
[One specific thing to do]
`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be specific. Use real data from web search. Max 300 words.

IMPORTANT: Always finish your last sentence completely. Never cut off mid-word or mid-sentence. If you are running out of space, wrap up with a complete concluding sentence.

Do NOT use citation markers, superscript numbers, or standalone dots. Write in clean prose only.
${isF ? `
CRITICAL: Respond ENTIRELY in French. ALL section headers, ALL content, ALL labels must be in French. Keep the exact same structure but translate everything. Never write a single word in English.` : `
CRITICAL: Respond entirely in English.`}`;

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  });

  const report = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Save to market_watches table
  await supabaseAdmin.from("market_watches").insert({
    project_id: projectId,
    user_id: userId,
    report,
  });

  return NextResponse.json({ report });
}
