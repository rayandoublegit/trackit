import Anthropic from "@anthropic-ai/sdk";

export interface ContentAnalysis {
  style: string; // visual style/format
  themes: string[]; // recurring topics observed
  production: string; // production quality + short reason
  brandSafe: boolean;
  brandFit: string; // ideal brand/product + collab angle
  summary: string; // one-line
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export function buildAnalysisPrompt(meta: { displayName: string; niche: string; followers: number }): string {
  return `Tu es analyste en marketing d'influence. On te montre des frames (couvertures de vidéos TikTok récentes) d'un créateur.

Créateur : ${meta.displayName} — niche "${meta.niche}", ${meta.followers} abonnés.

Analyse VISUELLEMENT ces images et réponds UNIQUEMENT par un objet JSON en français, sans aucune prose :
{
  "style": string,        // style/format visuel (ex: "talking-head face caméra", "démo produit", "vlog lifestyle", "transitions dynamiques")
  "themes": string[],     // 2 à 4 thèmes/sujets récurrents observés
  "production": string,   // "pro", "soignée" ou "amateur" + courte raison
  "brandSafe": boolean,   // false si contenu adulte/choquant/dangereux
  "brandFit": string,     // pour quel type de marque/produit ce créateur est idéal + angle de collab (1 phrase)
  "summary": string       // résumé en 1 phrase de ce que fait ce créateur
}`;
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in analysis output");
  return body.slice(start, end + 1);
}

export function parseAnalysis(text: string): ContentAnalysis {
  const obj = JSON.parse(extractJson(text)) as Record<string, unknown>;
  return {
    style: String(obj.style ?? "").trim(),
    themes: Array.isArray(obj.themes) ? obj.themes.map((t) => String(t).trim()).filter(Boolean).slice(0, 5) : [],
    production: String(obj.production ?? "").trim(),
    brandSafe: obj.brandSafe !== false,
    brandFit: String(obj.brandFit ?? "").trim(),
    summary: String(obj.summary ?? "").trim(),
  };
}

// Fetch a TikTok CDN image (referer-spoofed, same as the proxy) as base64 for vision.
async function fetchImageBase64(url: string): Promise<{ media_type: ImageMediaType; data: string } | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
        Accept: "image/webp,image/avif,image/*,*/*",
      },
    });
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "image/webp").split(";")[0].toLowerCase();
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > 4_500_000) return null; // keep payload sane
    return { media_type: ct as ImageMediaType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

export async function analyzeCreatorContent(
  covers: string[],
  meta: { displayName: string; niche: string; followers: number }
): Promise<ContentAnalysis | null> {
  const imgs = (await Promise.all(covers.slice(0, 4).map(fetchImageBase64))).filter(
    (x): x is { media_type: ImageMediaType; data: string } => x !== null
  );
  if (imgs.length === 0) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content: Anthropic.ContentBlockParam[] = [
    ...imgs.map((im) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: im.media_type, data: im.data },
    })),
    { type: "text" as const, text: buildAnalysisPrompt(meta) },
  ];
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return parseAnalysis(text);
}
