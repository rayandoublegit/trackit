import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const { creator, brand, tone, platform } = await request.json();

  const toneMap: Record<string, string> = {
    casual: "casual and friendly, like a real person not a marketer",
    professional: "professional and respectful",
    friendly: "warm and enthusiastic",
    direct: "direct and concise, no fluff"
  };

  const message = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are a brand outreach specialist. Write a personalized creator outreach message.

Creator info:
- Name: ${creator.displayName}
- Handle: @${creator.username}
- Platform: ${creator.platform}
- Niche: ${creator.niche}
- Followers: ${creator.followersCount}
- Engagement rate: ${creator.engagementRate}%
- Bio: ${creator.bio}

Brand info:
- Product/brand: ${brand}
- Platform to send on: ${platform}
- Tone: ${toneMap[tone] || toneMap.casual}

Write a short personalized outreach message (max 150 words). 
- Reference something specific about their content or niche
- Mention the partnership opportunity naturally
- End with a clear but soft call to action
- Do NOT use generic phrases like "I love your content"
- Sound like a real founder, not a marketing team
- No hashtags, no emojis unless tone is casual

Output only the message text, nothing else.`
      }
    ]
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return NextResponse.json({ message: text });
}
