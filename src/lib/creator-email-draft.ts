// First email a brand sends a creator. AI draft (/api/generate-outreach) when
// the plan allows it, else a bilingual template filled with the creator's real
// data only (name, handle, platform, niche): no audience numbers are invented.
import { nicheLabel } from "@/lib/niche-tree";

export type DraftLang = "en" | "fr";

export type DraftCreator = {
  username: string;
  displayName?: string | null;
  platform?: string | null;
  niche?: string | null;
  primaryNiche?: string | null;
  followersCount?: number | null;
  engagementRate?: number | null;
  bio?: string | null;
};

export type EmailDraft = {
  subject: string;
  body: string;
  source: "ai" | "template";
};

const PLATFORM_NAMES: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "X",
  x: "X",
};

export function platformDisplayName(platform: string | null | undefined): string {
  const p = (platform ?? "").trim().toLowerCase();
  if (!p) return "";
  return PLATFORM_NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

function cleanHandle(username: string): string {
  return username.replace(/^@/, "").trim();
}

/** First name when the display name looks like a person's name, else the @handle. */
export function greetingName(creator: Pick<DraftCreator, "username" | "displayName">): string {
  const handle = cleanHandle(creator.username);
  const display = (creator.displayName ?? "").trim();
  if (!display || display.replace(/^@/, "").toLowerCase() === handle.toLowerCase()) return handle;
  // Strip emoji / symbols, keep letters, spaces, hyphens and apostrophes.
  const letters = display.replace(/[^\p{L}\p{M}\s'’-]/gu, " ").replace(/\s+/g, " ").trim();
  const first = letters.split(" ")[0] ?? "";
  if (first.length >= 2 && first.length <= 20) return first;
  return handle;
}

function creatorNiche(creator: DraftCreator, lang: DraftLang): string {
  const raw = (creator.primaryNiche || creator.niche || "").trim();
  if (!raw || raw.toLowerCase() === "general" || raw.toLowerCase() === "other") return "";
  return nicheLabel(raw, lang).toLowerCase();
}

/** "Best,\nAcme" — skipped when the body already ends with the brand name. */
export function ensureSignature(body: string, brandName: string, lang: DraftLang): string {
  const brand = brandName.trim();
  const text = body.trim();
  if (!brand) return text;
  const tail = text.split("\n").slice(-3).join("\n").toLowerCase();
  if (tail.includes(brand.toLowerCase())) return text;
  return `${text}\n\n${lang === "fr" ? "Bien à vous," : "Best,"}\n${brand}`;
}

/** Remove "[Your name]"-style placeholders the model sometimes leaves in. */
function fillPlaceholders(text: string, brandName: string): string {
  const brand = brandName.trim();
  return text
    .replace(/\[(?:your|votre)\s+(?:brand|marque|company|entreprise|soci[ée]t[ée])(?:\s+name)?\]/gi, brand)
    .replace(/\[(?:your|votre)\s+(?:name|nom|pr[ée]nom)\]/gi, brand)
    .replace(/\n[^\n]*\[[^\]\n]{2,40}\][^\n]*(?=\n|$)/g, "")
    .trim();
}

export function buildTemplateEmailDraft(options: { creator: DraftCreator; brandName: string; lang: DraftLang }): EmailDraft {
  const { creator, lang } = options;
  const brand = options.brandName.trim();
  const handle = cleanHandle(creator.username);
  const name = greetingName(creator);
  const platform = platformDisplayName(creator.platform);
  const niche = creatorNiche(creator, lang);

  if (lang === "fr") {
    const account = platform ? `votre compte ${platform} (@${handle})` : `votre compte @${handle}`;
    const content = niche ? ` et votre contenu ${niche}` : "";
    const subject = brand ? `${brand} x ${name} : proposition de partenariat` : `Proposition de partenariat pour @${handle}`;
    const intro = brand ? `Je vous écris de la part de ${brand}.` : "Je vous écris au sujet d’un partenariat.";
    const body = [
      `Bonjour ${name},`,
      `${intro} J’ai découvert ${account}${content}, et je pense que votre univers correspondrait très bien à notre marque.`,
      "Nous aimerions vous proposer une collaboration rémunérée. Si cela vous intéresse, pourriez-vous m’indiquer vos tarifs et les formats que vous préférez (vidéo, story, série de contenus) ?",
      "Je peux vous envoyer plus de détails sur la marque et le produit.",
    ].join("\n\n");
    return { subject, body: ensureSignature(body, brand, lang), source: "template" };
  }

  const account = platform ? `your ${platform} account (@${handle})` : `your account @${handle}`;
  const content = niche ? ` and your ${niche} content` : "";
  const subject = brand ? `${brand} x ${name}: partnership idea` : `Partnership idea for @${handle}`;
  const intro = brand ? `I'm reaching out from ${brand}.` : "I'm reaching out about a partnership.";
  const body = [
    `Hi ${name},`,
    `${intro} I came across ${account}${content}, and I think your style would be a great fit for our brand.`,
    "We'd love to work with you on a paid collaboration. If you're open to it, could you share your rates and the formats you prefer (video, story, content series)?",
    "Happy to send more details about the brand and the product.",
  ].join("\n\n");
  return { subject, body: ensureSignature(body, brand, lang), source: "template" };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * AI draft when allowed (falls back to the template on any failure, so the
 * brand always gets an email ready). Brand name signs the email.
 */
export async function generateCreatorEmailDraft(options: {
  creator: DraftCreator;
  brandName: string;
  lang: DraftLang;
  allowAI: boolean;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<EmailDraft> {
  const template = buildTemplateEmailDraft(options);
  const brand = options.brandName.trim();
  // The AI route needs a brand to pitch; without one the template is better.
  if (!options.allowAI || !brand) return template;

  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000) : null;
  try {
    const c = options.creator;
    const res = await fetchImpl("/api/generate-outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller?.signal,
      body: JSON.stringify({
        creator: {
          username: cleanHandle(c.username),
          displayName: c.displayName || cleanHandle(c.username),
          platform: platformDisplayName(c.platform),
          niche: c.primaryNiche || c.niche || "",
          // Only real stats; 0 means unknown and the prompt is told so by its value.
          followersCount: Number(c.followersCount) || 0,
          engagementRate: Number(c.engagementRate) || 0,
          bio: c.bio || "",
        },
        brand,
        tone: "professional",
        platform: "Email",
        lang: options.lang,
      }),
    });
    if (!res.ok) return template;
    const data = (await res.json().catch(() => ({}))) as { message?: unknown; subject?: unknown };
    const message = typeof data.message === "string" ? fillPlaceholders(data.message, brand) : "";
    if (message.length < 40) return template;
    const subject = typeof data.subject === "string" && data.subject.trim() ? data.subject.trim() : template.subject;
    return { subject, body: ensureSignature(message, brand, options.lang), source: "ai" };
  } catch {
    return template;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
