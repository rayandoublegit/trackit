import { NextResponse } from "next/server";
import { AI_UNAVAILABLE, aiUnavailableMessage, reportAiFailure } from "@/lib/ai-provider";
import { getAuthedUserId } from "@/lib/api-auth";
import { chat, llmConfigured } from "@/lib/llm";
import { canUseAutoFollowUp, lowestTierFor } from "@/lib/plan-limits";
import { paywallResponse, resolveOwnerPlan } from "@/lib/plan-gate-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const clamp = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  // Signed-in Pro / Scale only: every call spends AI credits.
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const plan = await resolveOwnerPlan(admin, userId);
  if (!canUseAutoFollowUp(plan)) {
    return paywallResponse("ai-outreach", lowestTierFor(canUseAutoFollowUp), { message: "AI follow-ups require Pro or Scale" });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const creator = (body.creator && typeof body.creator === "object" ? body.creator : {}) as Record<string, unknown>;
  const lang = body.lang === "fr" ? "fr" : "en";
  const originalMessage = clamp(body.originalMessage, 4000);
  const username = clamp(creator.username, 80).replace(/^@/, "");
  if (!username || !originalMessage) return NextResponse.json({ error: "Missing creator or message" }, { status: 400 });

  // The brand signs the follow-up: its business name, never "Trackit".
  let brand = clamp(body.brand, 120);
  if (admin) {
    try {
      const { data } = await admin.from("profiles").select("business_name").eq("id", userId).maybeSingle();
      const name = clamp((data as { business_name?: unknown } | null)?.business_name, 120);
      if (name) brand = name;
    } catch {
      /* keep the client's value */
    }
  }
  const daysSince = Math.max(1, Math.min(90, Math.round(Number(body.daysSince) || 3)));
  const tone = ["casual", "professional", "friendly"].includes(String(body.tone)) ? String(body.tone) : "casual";

  if (!llmConfigured()) {
    return NextResponse.json({ error: AI_UNAVAILABLE, message: aiUnavailableMessage(lang) }, { status: 503 });
  }

  try {
    const message = await chat(
      [
        {
          role: "user",
          content: `You are a brand outreach specialist. Write a follow up message for a creator who hasn't replied.

Creator: ${clamp(creator.displayName, 120) || username} (@${username})
Platform: ${clamp(creator.platform, 40)}
Original message sent ${daysSince} days ago.
Brand: ${brand || "(not given: sign without a brand name)"}
Tone: ${tone}

Original message:
${originalMessage}

Write a short follow up (max 80 words).
- Acknowledge you already reached out
- Don't be pushy or desperate
- Add a small new hook or value proposition
- Keep it even shorter than the original
- Sound human, not automated
- Never invent numbers, prices or facts that are not in the original message
- Write the message in ${lang === "fr" ? "French" : "English"}.

Output only the follow up message text, nothing else.`,
        },
      ],
      { model: "smart", maxTokens: 400, timeoutMs: 30_000 },
    );
    const text = message.text;
    if (!text) return NextResponse.json({ error: "Generation failed" }, { status: 502 });
    return NextResponse.json({ message: text });
  } catch (e) {
    const failure = reportAiFailure("generate-follow-up", e);
    if (failure.kind !== "request" && failure.kind !== "unknown") {
      return NextResponse.json({ error: AI_UNAVAILABLE, message: aiUnavailableMessage(lang) }, { status: 503 });
    }
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
}
