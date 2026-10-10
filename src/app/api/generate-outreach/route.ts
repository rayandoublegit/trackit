import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildOutreachGenerationPrompt,
  parseOutreachGenerationResponse,
} from "@/lib/outreach-ai-prompt";
import { canUseAIOutreach, lowestTierFor, normalizePlan } from "@/lib/plan-limits";
import { paywallResponse } from "@/lib/plan-gate-server";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await resolveWorkspaceContextForUser(user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", workspace.ownerId)
    .maybeSingle();
  const plan = normalizePlan(profile?.plan);
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

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    });
  } catch {
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
  if (message.stop_reason === "refusal") {
    return NextResponse.json({ error: "Generation declined" }, { status: 422 });
  }

  // Thinking blocks may come first: join the text blocks only.
  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const parsed = parseOutreachGenerationResponse(raw, String(platform ?? ""));

  return NextResponse.json({
    message: parsed.message,
    subject: parsed.subject ?? null,
  });
}
