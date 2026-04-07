import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 60;

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
  const { ideaName, talkedToUsers, usersCount, buildDays, revenue, notes, username, lang } = body;
  const isF = lang === "fr";

  const prompt = `You are Klayan — a brutal but fair AI co-founder doing a weekly check-up for ${username}.

IDEA THEY ARE BUILDING: ${ideaName}

THIS WEEK'S DATA:
- Talked to users: ${talkedToUsers ? `Yes (${usersCount} people)` : "No"}
- Days of building: ${buildDays}/7
- Revenue: $${revenue}
- What happened: ${notes || "Nothing reported"}

Generate a sharp weekly check-up in this exact format:

WHAT'S WORKING
[1-2 sentences on what's going well based on their data]

WHAT'S BLOCKING YOU
[1-2 sentences on the main blocker you detect]

THIS WEEK'S ONE ACTION
[One specific, concrete action they must take this week. Not generic advice. Something they can do today.]

BRUTAL TRUTH
[One hard truth about where ${username} is right now based on the data. Address them directly by name.]

Keep it under 200 words. Be direct. No fluff.

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
