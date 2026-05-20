import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const { creator, brand } = await request.json();

  const message = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `You are a creator marketing expert. Analyze this creator for a brand partnership.

Creator:
- Name: ${creator.displayName}
- Niche: ${creator.niche}
- Followers: ${creator.followersCount}
- Engagement rate: ${creator.engagementRate}%
- Platform: ${creator.platform}
- Bio: ${creator.bio}

Brand: ${brand}

Provide a short analysis with:
1. FIT SCORE: X/10 — one sentence why
2. AUDIENCE MATCH: one sentence on audience alignment
3. RISK: one sentence on any red flags
4. RECOMMENDATION: BUILD IT / APPROACH WITH CAUTION / SKIP IT — one sentence

Keep each point to one sentence max. Be brutally honest. Output only the 4 points, no extra text.`
      }
    ]
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return NextResponse.json({ analysis: text });
}
