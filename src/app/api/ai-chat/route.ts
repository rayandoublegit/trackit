import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { buildFeedPage } from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

function influencerSearch(text: string): { niche: string; platform?: string } | null {
  if (!/\b(influenc|créat|creat|cherche|find|search|liste|list|niche)\b/i.test(text)) return null;
  let platform: string | undefined;
  if (/tiktok/i.test(text)) platform = "tiktok";
  else if (/instagram/i.test(text)) platform = "instagram";
  else if (/youtube/i.test(text)) platform = "youtube";
  const niche = text
    .replace(/[?.!,]/g, " ")
    .replace(
      /\b(find|search|cherche|moi|me|des|les|the|some|any|tous|all|influencers?|influenceurs?|creators?|créateurs?|createurs?|niche|dans|pour|for|in|on|sur|with|avec|liste|list|de|du|la|le|un|une|and|et|tiktok|instagram|youtube)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  if (niche.length < 2) return null;
  return { niche, platform };
}

async function creatorList(text: string, lang: "fr" | "en"): Promise<string> {
  const intent = influencerSearch(text);
  if (!intent) return "";
  try {
    const page = await buildFeedPage({ niche: intent.niche, platform: intent.platform }, 0, 12);
    const rows = page.creators.slice(0, 12);
    if (rows.length === 0) {
      return lang === "fr"
        ? `J’ai cherché « ${intent.niche} » dans le catalogue. Aucun créateur pour l’instant.`
        : `I searched “${intent.niche}” in the catalog. Nothing matched yet.`;
    }
    const lines = rows.map((creator) => {
      const followers =
        creator.followersCount != null ? Number(creator.followersCount).toLocaleString("en-US") : "—";
      return `@${creator.username} · ${followers} · ${creator.platform || "—"} · ${creator.primaryNiche || intent.niche}`;
    });
    const head =
      lang === "fr"
        ? `Voici ${rows.length} créateurs pour « ${intent.niche} ».`
        : `Here are ${rows.length} creators for “${intent.niche}”.`;
    return `${head}\n${lines.join("\n")}`;
  } catch {
    return lang === "fr" ? "La recherche créateurs n’a pas répondu." : "The creator search did not respond.";
  }
}

function isDeepAsk(text: string) {
  return /\b(deep|search|analyse|analyz|research|stratégie|strategie|explique en détail|explain in detail|pourquoi|how does|comment marche|compar|audit|plan détaillé|detailed)\b/i.test(
    text,
  );
}

function systemPrompt(lang: "fr" | "en", role: "brand" | "creator") {
  if (role === "creator") {
    if (lang === "fr") {
      return [
        "Tu t’appelles Mino. Tu es l’assistant Trackit pour les créateurs, chaleureux et utile.",
        "Tu parles comme une vraie personne, jamais comme un bot corporate.",
        "Style obligatoire: pas de markdown, pas de # titres, pas de puces avec - ou *, pas de gras **, texte simple.",
        "emojis ok avec parcimonie (1 ou 2 max).",
        "Pour un bonjour ou une question courte: 1 à 3 phrases.",
        "Tu aides le créateur sur: analytiques (ventes, commissions, RPM / vues), poster du contenu avec URL TikTok, communauté, infos/règles/pricing de la marque, hooks, Pay it / solde, planner, whiteboard, paramètres.",
        "Si l’utilisateur veut ouvrir une section, dis-le simplement (Analytiques, Contenu, Communauté, Pay it, etc.).",
      ].join("\n");
    }
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

  if (lang === "fr") {
    return [
      "Tu t’appelles Mino. Tu es l’assistant de Trackit, chaleureux, humain et utile.",
      "Tu parles comme une vraie personne, jamais comme un bot corporate.",
      "Style obligatoire:",
      "pas de markdown",
      "pas de # titres",
      "pas de puces avec - ou *",
      "pas de gras **",
      "texte simple, phrases naturelles",
      "emojis ok mais avec parcimonie (1 ou 2 max, seulement si ça aide)",
      "Pour un bonjour, une formalité ou une question courte: réponse très courte (1 à 3 phrases).",
      "Pour une demande profonde (stratégie, analyse, deep search, explication détaillée): réponse plus longue et structurée en paragraphes courts, toujours sans - ni *.",
      "Tu aides sur campagnes, créateurs, outreach, paiements, contenu, planner, inbox.",
      "Si l’utilisateur veut ouvrir une section, dis-le simplement (Inbox, Campagnes, Pay it, etc.).",
    ].join("\n");
  }
  return [
    "Your name is Mino. You are Trackit’s assistant: warm, human, and useful.",
    "Talk like a real person, never like a corporate bot.",
    "Required style:",
    "no markdown",
    "no # headings",
    "no bullet points with - or *",
    "no ** bold",
    "plain text, natural sentences",
    "emojis ok sparingly (1–2 max, only if helpful)",
    "For hellos, small talk, or short questions: keep it very short (1–3 sentences).",
    "For deep asks (strategy, analysis, deep search, detailed explanation): go longer in short paragraphs, still with no - or *.",
    "You help with campaigns, creators, outreach, payouts, content, planner, inbox.",
    "You can search any influencer niche through the discovery index and list the handles you are given.",
    "If the user wants to open a section, say it simply (Inbox, Campaigns, Pay it, etc.).",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      lang?: "fr" | "en";
      role?: "brand" | "creator";
    };
    const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    const lang = body.lang === "en" ? "en" : "fr";
    const role = body.role === "creator" ? "creator" : "brand";
    const last = messages.filter((m) => m.role === "user").at(-1)?.content?.trim();
    if (!last) {
      return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
    }

    const listed = role === "brand" ? await creatorList(last, lang) : "";

    const deep = isDeepAsk(last);
    const system = listed ? `${systemPrompt(lang, role)}\n\nCreator search results:\n${listed}` : systemPrompt(lang, role);

    if (process.env.OPENAI_API_KEY) {
      const openai = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: deep ? 1200 : 220,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      const payload = (await openai.json()) as { choices?: { message?: { content?: string } }[] };
      const reply = (payload.choices?.[0]?.message?.content ?? "")
        .trim()
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/^\s*[-*]\s+/gm, "");
      const withList = listed && !reply.includes("@") ? `${reply}\n\n${listed}` : reply;
      return NextResponse.json({
        ok: true,
        reply: withList || listed || (lang === "fr" ? "Hmm, j’ai un blanc. Reformule ?" : "Hmm, blank moment. Try again?"),
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        ok: true,
        reply:
          listed ||
          (lang === "fr"
            ? "Salut, c’est Mino. Dis-moi une niche et je te liste des créateurs."
            : "Hey, I’m Mino. Name a niche and I’ll list creators."),
      });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: deep ? 1200 : 220,
      system,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const reply = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/^\s*[-*]\s+/gm, "");

    const withList = listed && !reply.includes("@") ? `${reply}\n\n${listed}` : reply;

    return NextResponse.json({
      ok: true,
      reply:
        withList ||
        listed ||
        (lang === "fr" ? "Hmm, j’ai un blanc. Reformule ?" : "Hmm, blank moment. Try again?"),
    });
  } catch (e) {
    console.error("POST /api/ai-chat", e);
    return NextResponse.json({ ok: false, error: "Chat failed" }, { status: 500 });
  }
}
