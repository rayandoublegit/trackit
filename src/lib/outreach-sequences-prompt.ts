// Prompts for personalised sequence emails (first email + short follow-ups).
// Pure: no I/O. The rule that matters most: the model only sees real stored
// facts, numbers are given pre-formatted, and any number in the output that is
// not in those facts (or in the brand's own pitch) is rejected.
import { TONE_MAP } from "@/lib/outreach-ai-prompt";
import type { SequenceLang, SequenceTone } from "@/lib/outreach-sequences";

/** Real stored data about one creator. Every field is optional: unknown = omitted. */
export type CreatorFacts = {
  username: string;
  platform: string;
  displayName?: string | null;
  niche?: string | null;
  followers?: number | null;
  avgViews?: number | null;
  engagementRate?: number | null;
  recentVideoCaption?: string | null;
  country?: string | null;
  language?: string | null;
  bio?: string | null;
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
};

/** The creator's language when we know it and can write it, else the sequence language. */
export function resolveEmailLanguage(
  creatorLanguage: string | null | undefined,
  sequenceLang: SequenceLang,
): { code: string; name: string; optOutLang: SequenceLang } {
  const code = String(creatorLanguage ?? "").trim().toLowerCase().slice(0, 2);
  if (code && LANGUAGE_NAMES[code]) {
    return { code, name: LANGUAGE_NAMES[code], optOutLang: code === "fr" ? "fr" : "en" };
  }
  return { code: sequenceLang, name: LANGUAGE_NAMES[sequenceLang], optOutLang: sequenceLang };
}

export function formatCompact(n: number, lang: string): string {
  const fr = lang === "fr";
  const fmt = (v: number, suffix: string) => {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
    return `${fr ? s.replace(".", ",") : s}${fr ? ` ${suffix.toLowerCase()}` : suffix}`;
  };
  const r = Math.round(n);
  if (Math.abs(r) >= 1_000_000) return fmt(Math.round(r / 100_000) / 10, "M");
  if (Math.abs(r) >= 1_000) return fmt(Math.round(r / 100) / 10, "K");
  return String(r);
}

function formatPercent(n: number, lang: string): string {
  const s = (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return lang === "fr" ? `${s.replace(".", ",")} %` : `${s}%`;
}

function positive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function clip(s: string | null | undefined, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Fact lines given to the model. Only known values appear; numbers are pre-formatted. */
export function buildFactLines(facts: CreatorFacts, lang: string): string[] {
  const lines: string[] = [];
  const name = clip(facts.displayName, 80);
  if (name) lines.push(`Name: ${name}`);
  lines.push(`Handle: @${facts.username.replace(/^(ig_|yt_)/, "")} on ${facts.platform || "social media"}`);
  if (clip(facts.niche, 60)) lines.push(`Niche: ${clip(facts.niche, 60)}`);
  if (positive(facts.followers)) lines.push(`Followers: ${formatCompact(facts.followers, lang)}`);
  if (positive(facts.avgViews)) lines.push(`Average views per video: ${formatCompact(facts.avgViews, lang)}`);
  if (positive(facts.engagementRate)) lines.push(`Engagement rate: ${formatPercent(facts.engagementRate, lang)}`);
  if (clip(facts.country, 40)) lines.push(`Country: ${clip(facts.country, 40)}`);
  if (clip(facts.recentVideoCaption, 220)) lines.push(`Recent video caption: "${clip(facts.recentVideoCaption, 220)}"`);
  if (clip(facts.bio, 200)) lines.push(`Bio: "${clip(facts.bio, 200)}"`);
  return lines;
}

const SHARED_RULES = (languageName: string) => `Hard rules:
- Write in ${languageName}.
- Use ONLY the facts given. Never invent anything about the creator (no made-up videos, collaborations, audience details or results).
- Numbers: you may use a number only if it appears exactly as written in the CREATOR FACTS or the BRAND OFFER. Otherwise write no number at all (no invented prices, percentages, view counts, dates or statistics).
- Plain text only: no markdown, no bullet lists, no emoji, no hashtags, no links unless the brand offer contains one.
- Do not add a signature, a sign-off name, an unsubscribe line or placeholders like [Name] — they are added automatically.
- If the creator's name is unknown, greet them by their handle or with a neutral greeting.`;

export type FirstEmailPromptInput = {
  facts: CreatorFacts;
  brandPitch: string;
  tone: SequenceTone;
  languageName: string;
  senderName?: string | null;
  lang: string;
};

export function buildFirstEmailPrompt(input: FirstEmailPromptInput): { system: string; user: string } {
  const toneLabel = TONE_MAP[input.tone] || TONE_MAP.friendly;
  const system = `You write first-contact partnership emails from a brand to a social media creator. The email must read like a real person from the brand wrote it for this one creator — specific, short and respectful of their time.

Tone: ${toneLabel}.
Shape: a subject of 4 to 9 words (no ALL CAPS, no clickbait, no emoji); a body of 70 to 140 words in 2 to 4 short paragraphs: one specific hook drawn from the facts (their niche, or the topic of their recent video), what the brand offers and why it fits their audience, then one low-friction question as the call to action.

${SHARED_RULES(input.languageName)}

Return JSON with "subject" and "body".`;

  const user = `CREATOR FACTS (stored data, the only facts you may use):
${buildFactLines(input.facts, input.lang).map((l) => `- ${l}`).join("\n")}

BRAND OFFER (written by the brand${input.senderName ? `, sender: ${clip(input.senderName, 80)}` : ""}):
${clip(input.brandPitch, 1500)}`;

  return { system, user };
}

export type FollowUpPromptInput = {
  facts: CreatorFacts;
  brandPitch: string;
  tone: SequenceTone;
  languageName: string;
  lang: string;
  firstSubject: string;
  firstBody: string;
  followUpNumber: number;
};

export function buildFollowUpPrompt(input: FollowUpPromptInput): { system: string; user: string } {
  const toneLabel = TONE_MAP[input.tone] || TONE_MAP.friendly;
  const last = input.followUpNumber >= 3;
  const system = `You write a short follow-up to a partnership email a brand already sent to a creator who has not replied. It is sent in the same email thread.

Tone: ${toneLabel}.
Shape: 25 to 70 words, 1 or 2 short paragraphs. Refer to the previous email briefly ("my email from last week" style), add one new angle or make the ask easier, end with a simple yes/no question.${last ? " This is the last follow-up: say politely you will not write again after this one." : ""}
Never guilt-trip, never pretend it is urgent.

${SHARED_RULES(input.languageName)}

Return JSON with "body".`;

  const user = `CREATOR FACTS:
${buildFactLines(input.facts, input.lang).map((l) => `- ${l}`).join("\n")}

BRAND OFFER:
${clip(input.brandPitch, 1500)}

FIRST EMAIL (already sent, subject "${clip(input.firstSubject, 160)}"):
${clip(input.firstBody, 1500)}

Write follow-up number ${input.followUpNumber}.`;

  return { system, user };
}

export const FIRST_EMAIL_SCHEMA = {
  type: "object",
  properties: { subject: { type: "string" }, body: { type: "string" } },
  required: ["subject", "body"],
  additionalProperties: false,
} as const;

export const FOLLOW_UP_SCHEMA = {
  type: "object",
  properties: { body: { type: "string" } },
  required: ["body"],
  additionalProperties: false,
} as const;

/** Parses the model's JSON; tolerates code fences. */
export function parseEmailJson(raw: string): { subject?: string; body: string } | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : undefined;
    const body = typeof parsed.body === "string" ? parsed.body.trim() : undefined;
    if (!body) return null;
    return { subject, body };
  } catch {
    return null;
  }
}

// ── Number guard ────────────────────────────────────────────────────────────────

/** Numbers as written ("128.4", "6,3", "20"), decimal comma read as a dot. */
function numberTokens(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((t) => t.replace(/,/g, "."));
}

/**
 * Numbers in `text` that appear in none of `sources` (the fact lines and the
 * brand pitch). Whole numbers are compared, so "3x" is not excused by "6.3%".
 */
export function findUnsupportedNumbers(text: string, sources: string[]): string[] {
  const allowed = new Set(sources.flatMap(numberTokens));
  return Array.from(new Set(numberTokens(text).filter((d) => !allowed.has(d))));
}

export function numberSourcesFor(facts: CreatorFacts, brandPitch: string, lang: string, extra: string[] = []): string[] {
  return [...buildFactLines(facts, lang), brandPitch, ...extra];
}

// ── Deterministic follow-up (used when the AI is unavailable) ───────────────────

export function fallbackFollowUp(followUpNumber: number, langCode: string, creatorName: string): string {
  const fr = langCode === "fr";
  const name = creatorName.trim();
  const hi = fr ? (name ? `Bonjour ${name},` : "Bonjour,") : name ? `Hi ${name},` : "Hi,";
  if (followUpNumber >= 3) {
    return fr
      ? `${hi}\n\nJe me permets une dernière relance sur mon message précédent. Si ce n'est pas le bon moment, aucun souci, je ne vous relancerai plus. Est-ce que cela pourrait vous intéresser ?`
      : `${hi}\n\nOne last note on my previous email. If the timing isn't right, no problem at all and I won't follow up again. Would this be of interest?`;
  }
  return fr
    ? `${hi}\n\nJe reviens vers vous au sujet de mon message précédent, au cas où il serait passé inaperçu. Seriez-vous ouvert(e) à en discuter ?`
    : `${hi}\n\nJust bringing my previous email back to the top of your inbox in case it got buried. Would you be open to a quick chat about it?`;
}
