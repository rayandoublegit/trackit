import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

type ChatMessage = { role: "user" | "assistant"; content: string };

function isDeepAsk(text: string) {
  return /\b(deep|search|analyse|analyz|research|stratégie|strategie|explique en détail|explain in detail|pourquoi|how does|comment marche|compar|audit|plan détaillé|detailed)\b/i.test(
    text,
  );
}

function systemPrompt(lang: "fr" | "en") {
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
    "If the user wants to open a section, say it simply (Inbox, Campaigns, Pay it, etc.).",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      lang?: "fr" | "en";
    };
    const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    const lang = body.lang === "en" ? "en" : "fr";
    const last = messages.filter((m) => m.role === "user").at(-1)?.content?.trim();
    if (!last) {
      return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        ok: true,
        reply:
          lang === "fr"
            ? "Salut, c’est Mino 👋 Dis-moi ce dont tu as besoin."
            : "Hey, I’m Mino 👋 Tell me what you need.",
      });
    }

    const deep = isDeepAsk(last);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: deep ? 1200 : 220,
      system: systemPrompt(lang),
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

    return NextResponse.json({
      ok: true,
      reply:
        reply ||
        (lang === "fr" ? "Hmm, j’ai un blanc. Reformule ?" : "Hmm, blank moment. Try again?"),
    });
  } catch (e) {
    console.error("POST /api/ai-chat", e);
    return NextResponse.json({ ok: false, error: "Chat failed" }, { status: 500 });
  }
}
