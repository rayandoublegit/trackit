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
  const { messages, ideaName, username, verdict, notes } = body;

  const systemPrompt = `You are Klayan — a brutal but fair AI co-founder having a real strategic conversation with ${username} about their startup "${ideaName}".

CONTEXT YOU KNOW:
- Original verdict: ${verdict ?? "Unknown"}
- Recent notes from founder: ${notes ?? "None"}

YOUR ROLE:
- You are a co-founder, not a chatbot
- You push back when ideas are weak
- You validate when things are strong
- You ask sharp follow-up questions
- You use web search when you need current data
- Each response is 3-5 sentences max — keep it conversational
- Address ${username} by name naturally at least once per response
- End every response with one sharp question directed at ${username} that moves the conversation forward

NEVER:
- Give generic startup advice
- Be encouraging without evidence
- Write long essays
- Repeat yourself`;

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: systemPrompt,
    messages: messages,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  });

  const reply = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return NextResponse.json({ reply });
}
