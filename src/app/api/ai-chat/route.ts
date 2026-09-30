import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import type { FeedCreator } from "@/lib/discovery-feed";
import { describeSearch, parseCreatorSearch, runCreatorSearch, type MinoSearchResult } from "@/lib/mino-creator-search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };
type Lang = "en" | "fr";

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n);

/** What the model is told about the creators the app shows as cards. */
function searchBrief(result: MinoSearchResult, lang: Lang): string {
  const label = describeSearch(result.search, lang);
  if (!result.creators.length) {
    return `Creator search for "${label}" found nobody. Say so in one sentence and suggest widening one filter (niche word, follower range or country).`;
  }
  const lines = result.creators
    .slice(0, 8)
    .map(
      (c) =>
        `@${c.username} (${c.platform}) ${compact(c.followersCount)} followers, ${
          c.engagementRate ? `${c.engagementRate.toFixed(1)}% engagement` : "engagement unknown"
        }, ${c.primaryNiche || "no niche"}`,
    );
  return [
    `Creator search for "${label}" found ${result.creators.length} creators. The app shows them as cards under your reply.`,
    "Write 1 or 2 short sentences: say what you found and point out one standout and why. Never list the creators or their handles.",
    ...lines,
  ].join("\n");
}

/** Keeps stored chats light: only what the profile cards render (3 videos) and saving needs. */
function cardCreator(c: FeedCreator): FeedCreator {
  const topVideos = (c.topVideos ?? []).filter((v) => v.cover || v.shareUrl).slice(0, 3);
  return {
    ...c,
    bio: (c.bio || "").slice(0, 160),
    // Live search results carry thumbnails but no top videos: keep a few to play.
    videoThumbnails: topVideos.length ? [] : (c.videoThumbnails ?? []).filter((v) => v.thumbnail).slice(0, 3),
    topVideos,
  };
}

function fallbackReply(result: MinoSearchResult | null, lang: Lang): string {
  if (lang === "fr") {
    if (!result) return "Salut, moi c’est Mino. Donnez-moi une niche et je vous trouve des créateurs.";
    if (!result.creators.length)
      return `Personne ne correspond encore à « ${describeSearch(result.search, lang)} ». Essayez une niche plus large ou une fourchette d’abonnés plus grande.`;
    return `Voici ${result.creators.length} créateurs pour « ${describeSearch(result.search, lang)} ».`;
  }
  if (!result) return "Hey, I’m Mino. Name a niche and I’ll find creators for it.";
  if (!result.creators.length) return `Nobody matched “${describeSearch(result.search)}” yet. Try a broader niche or a wider follower range.`;
  return `Here are ${result.creators.length} creators for “${describeSearch(result.search)}”.`;
}

function isDeepAsk(text: string) {
  return (
    /\b(deep|analy[sz]e|research|strategy|explain in detail|how does|compare|audit|detailed plan|detailed)\b/i.test(text) ||
    /\b(analyse\w*|strat[ée]gie|explique\w* en d[ée]tail|comment fonctionne|compar\w*|plan d[ée]taill[ée]|d[ée]taill[ée]\w*|en profondeur)/i.test(text)
  );
}

/** Tells the model which language to answer in. */
function languageRule(lang: Lang): string {
  return lang === "fr"
    ? "Always reply in French (natural, everyday French), using « vous » with the user, even if earlier messages were in English. Keep product and brand names (Trackit, Mino, TikTok, Instagram, Shopify) as they are."
    : "";
}

function systemPrompt(role: "brand" | "creator") {
  if (role === "creator") {
    return [
      "Your name is Mino. You are Trackit’s assistant for creators: warm and useful.",
      "Talk like a real person, never like a corporate bot.",
      "Required style: no markdown, no # headings, no bullet points with - or *, no ** bold, plain text.",
      "emojis ok sparingly (1–2 max).",
      "For hellos or short questions: 1–3 sentences.",
      "You help creators with: analytics (sales, commissions, RPM / views), posting content with a TikTok URL, community, brand infos/rules/pricing, hooks, Pay it / balance, planner, whiteboard, settings.",
      "If the user wants to open a section, say it simply (Analytics, Content, Community, Pay it, etc.).",
    ].join("\n");
  }
  return [
    "Your name is Mino. You are Trackit’s assistant: warm, human, and useful.",
    "Talk like a real person, never like a corporate bot.",
    "Required style: no markdown, no # headings, no bullet points with - or *, no ** bold, plain text, natural sentences.",
    "emojis ok sparingly (1–2 max, only if helpful).",
    "For hellos, small talk, or short questions: keep it very short (1–3 sentences).",
    "For deep asks (strategy, analysis, detailed explanation): go longer in short paragraphs, still with no - or *.",
    "You help with campaigns, creators, outreach, payouts, content, planner, inbox.",
    "You can search creators in any niche: when the user asks, the app runs the search and shows the results as cards.",
    "You do not have access to the user’s sales or campaign numbers in this chat: never invent figures. Point them to Analytics or Payouts instead.",
    "If the user wants to open a section, say it simply (Inbox, Campaigns, Payouts, etc.).",
  ].join("\n");
}

function cleanReply(text: string): string {
  return text
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "");
}

export async function POST(request: Request) {
  // Signed-in users only: every call spends AI credits.
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { messages?: ChatMessage[]; role?: "brand" | "creator"; lang?: string };
    const lang: Lang = body.lang === "fr" ? "fr" : "en";
    const messages = (Array.isArray(body.messages) ? body.messages.slice(-16) : [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    const role = body.role === "creator" ? "creator" : "brand";
    const last = messages.filter((m) => m.role === "user").at(-1)?.content?.trim();
    if (!last) return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });

    const parsed = role === "brand" ? parseCreatorSearch(last) : null;
    const result = parsed ? await runCreatorSearch(parsed, 12) : null;
    const extra = result
      ? {
          creators: result.creators.map(cardCreator),
          search: { label: describeSearch(result.search, lang), sources: result.sources },
        }
      : {};

    const deep = isDeepAsk(last);
    const base = lang === "fr" ? `${systemPrompt(role)}\n${languageRule(lang)}` : systemPrompt(role);
    const system = result ? `${base}\n\n${searchBrief(result, lang)}` : base;
    const maxTokens = result ? 160 : deep ? 1200 : 220;

    let reply = "";
    if (process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      reply = cleanReply(payload.choices?.[0]?.message?.content ?? "");
    } else if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages,
      });
      reply = cleanReply(
        message.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n"),
      );
    }

    return NextResponse.json({ ok: true, reply: reply || fallbackReply(result, lang), ...extra });
  } catch (e) {
    console.error("POST /api/ai-chat", e);
    return NextResponse.json({ ok: false, error: "Chat failed" }, { status: 500 });
  }
}
