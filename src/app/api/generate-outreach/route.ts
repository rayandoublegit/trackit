import { NextResponse, type NextRequest } from "next/server";
import {
  buildOutreachGenerationPrompt,
  parseOutreachGenerationResponse,
} from "@/lib/outreach-ai-prompt";
import { chat, llmConfigured, type ChatResult } from "@/lib/llm";
import { AI_UNAVAILABLE, aiUnavailableMessage, reportAiFailure } from "@/lib/ai-provider";
import { canUseAIOutreach, lowestTierFor } from "@/lib/plan-limits";
import { paywallResponse, resolveOwnerPlan } from "@/lib/plan-gate-server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  // Workspace owner (team members included) and their plan, read with the
  // server key: the browser session can only read its own profile row, so team
  // members of a Scale workspace used to be treated as Free.
  const ownerId = await getAuthedUserId(request);
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plan = await resolveOwnerPlan(getSupabaseAdmin(), ownerId);
  if (!canUseAIOutreach(plan)) {
    // Free / Growth: the composer keeps its template draft and shows the Pro upsell.
    return paywallResponse("ai-outreach", lowestTierFor(canUseAIOutreach), { message: "AI outreach requires Pro or Scale" });
  }

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

  if (!llmConfigured()) {
    return NextResponse.json({ error: AI_UNAVAILABLE, message: aiUnavailableMessage(lang === "fr" ? "fr" : "en") }, { status: 503 });
  }

  let message: ChatResult;
  try {
    message = await chat([{ role: "user", content: prompt }], { model: "smart", maxTokens: 1500, timeoutMs: 40_000 });
  } catch (e) {
    const failure = reportAiFailure("generate-outreach", e);
    if (failure.kind !== "request" && failure.kind !== "unknown") {
      return NextResponse.json({ error: AI_UNAVAILABLE, message: aiUnavailableMessage(lang === "fr" ? "fr" : "en") }, { status: 503 });
    }
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
  if (message.finishReason === "refusal" || message.finishReason === "content_filter") {
    return NextResponse.json({ error: "Generation declined" }, { status: 422 });
  }

  const raw = message.text;
  const parsed = parseOutreachGenerationResponse(raw, String(platform ?? ""));

  return NextResponse.json({
    message: parsed.message,
    subject: parsed.subject ?? null,
  });
}
