import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const { creator, originalMessage, brand, daysSince, tone, lang } = await request.json();

  const message = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `You are a brand outreach specialist. Write a follow up message for a creator who hasn't replied.

Creator: ${creator.displayName} (@${creator.username})
Platform: ${creator.platform}
Original message sent ${daysSince} days ago.
Brand: ${brand}
Tone: ${tone || "casual"}

Original message:
${originalMessage}

Write a short follow up (max 80 words).
- Acknowledge you already reached out
- Don't be pushy or desperate
- Add a small new hook or value proposition
- Keep it even shorter than the original
- Sound human, not automated
- Write the message in ${lang === "fr" ? "French" : "English"}.

Output only the follow up message text, nothing else.`
      }
    ]
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return NextResponse.json({ message: text });
}
