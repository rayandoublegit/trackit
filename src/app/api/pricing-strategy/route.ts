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
  const { ideaName, username, checkins } = body;

  const revenue = checkins
    .slice(0, 5)
    .reduce((acc: number, c: any) => acc + (c.revenue ?? 0), 0);

  const prompt = `You are Klayan — a brutal pricing strategist. Help ${username} nail the pricing for "${ideaName}".

Current revenue from check-ins: $${revenue}

Generate a sharp pricing strategy report:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRICING STRATEGY — ${ideaName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDED MODEL
[Freemium / Flat rate / Usage-based / Per seat / Tiered — pick one and explain why for this specific idea]

PRICING TIERS
Free: [What's included and why]
Tier 1 — $[X]/mo: [Name + what's included]
Tier 2 — $[X]/mo: [Name + what's included]
Tier 3 — $[X]/mo: [Name + what's included]

PSYCHOLOGICAL ANCHORS
01 — [Pricing psychology trick to apply]
02 — [Pricing psychology trick to apply]
03 — [Pricing psychology trick to apply]

THE ONE PRICE TO START WITH
[If ${username} can only charge one price right now, what is it and why]

BIGGEST PRICING MISTAKE TO AVOID
[The #1 mistake founders make with pricing at this stage]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Max 300 words. Be specific to the idea.

IMPORTANT: Always finish your last sentence completely. Never cut off mid-word or mid-sentence. If you are running out of space, wrap up with a complete concluding sentence.

LANGUAGE RULE: Detect the language from the context and idea name provided. If French → respond entirely in French. If English → respond entirely in English. Never mix languages.`;

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const report = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return NextResponse.json({ report });
}
