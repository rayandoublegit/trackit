import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  buildOutreachGenerationPrompt,
  parseOutreachGenerationResponse,
} from "@/lib/outreach-ai-prompt";

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const { creator, brand, tone, platform, lang } = await request.json();

  if (!creator?.username || !brand?.trim()) {
    return NextResponse.json({ error: "Missing creator or brand" }, { status: 400 });
  }

  const prompt = buildOutreachGenerationPrompt({
    creator: {
      displayName: String(creator.displayName ?? creator.username ?? ""),
      username: String(creator.username ?? "").replace(/^@/, ""),
      platform: String(creator.platform ?? ""),
      niche: String(creator.niche ?? ""),
      followersCount: Number(creator.followersCount ?? 0) || 0,
      engagementRate: Number(creator.engagementRate ?? 0) || 0,
      bio: String(creator.bio ?? ""),
    },
    brand: String(brand).trim(),
    tone: String(tone ?? "casual"),
    platform: String(platform ?? "TikTok DM"),
    lang: String(lang ?? "en"),
  });

  const message = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const parsed = parseOutreachGenerationResponse(raw, String(platform ?? ""));

  return NextResponse.json({
    message: parsed.message,
    subject: parsed.subject ?? null,
  });
}
