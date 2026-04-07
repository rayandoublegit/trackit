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
  const { ideaName, username, targetType, context } = body;

  const prompt = `You are Klayan — a sharp outreach strategist helping ${username} get their first customers for "${ideaName}".

TARGET: ${targetType}
CONTEXT: ${context || "Early stage, no customers yet"}

Generate 3 ready-to-send outreach messages. Be hyper-specific to the idea and target. No generic templates.

FORMAT EXACTLY LIKE THIS:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTREACH ENGINE — ${targetType.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COLD EMAIL
Subject: [Sharp subject line under 8 words]

[First name],

[3-4 lines max. Lead with their pain. One specific result. One CTA. No fluff.]

[Your name]

LINKEDIN DM
[2-3 lines. Casual but sharp. Reference something specific about them or their company. End with a soft ask.]

TWITTER DM
[1-2 lines max. Direct. Intriguing. Makes them want to reply.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
