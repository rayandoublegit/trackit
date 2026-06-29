type OutreachCreatorInput = {
  displayName: string;
  username: string;
  platform: string;
  niche: string;
  followersCount: number;
  engagementRate: number;
  bio: string;
};

const TONE_MAP: Record<string, string> = {
  casual: "casual and friendly — like a real founder, not a marketer",
  professional: "professional, credible, and respectful",
  friendly: "warm, enthusiastic, and personable",
  direct: "direct and concise — no fluff, every line earns its place",
};

function isEmailPlatform(platform: string): boolean {
  return platform.toLowerCase().includes("email");
}

function channelRules(platform: string): string {
  if (isEmailPlatform(platform)) {
    return `COLD EMAIL rules (elite tier):
- Subject line: 6–12 words, specific and curiosity-driven — never spammy or ALL CAPS
- Opening: one credible, niche-specific hook (reference their content angle, not "I love your content")
- Body: clear value exchange for the creator's audience, one concrete partnership angle, soft CTA
- Length: 120–200 words for the body
- Structure: short paragraphs, scannable, no bullet walls unless truly needed
- Avoid: mass-blast tone, fake familiarity, vague "collab?" asks, discount-code spam patterns`;
  }

  const p = platform.toLowerCase();
  if (p.includes("tiktok")) {
    return `COLD DM rules — TikTok (elite tier):
- Ultra-scannable: 2–4 short blocks, mobile-first
- Max ~90 words — creators skim DMs in seconds
- Hook in the first line must prove you watched their content niche
- Sound peer-to-peer, not brand-to-influencer hierarchy
- One clear next step (reply, quick call, sample) — low friction
- Avoid: long paragraphs, corporate jargon, copy-paste giveaways`;
  }

  return `COLD DM rules — Instagram (elite tier):
- Conversational, under ~100 words
- First sentence must be specific to their niche or a recent content theme
- Partnership ask feels like a real opportunity, not a template
- Warm but not sycophantic — founders who get replies respect the creator's time
- Soft CTA: question or "open to chatting?" not "let's hop on a 30min call"
- Avoid: "Hey queen", generic praise, multi-paragraph essays`;
}

export function buildOutreachGenerationPrompt({
  creator,
  brand,
  tone,
  platform,
  lang,
}: {
  creator: OutreachCreatorInput;
  brand: string;
  tone: string;
  platform: string;
  lang: string;
}): string {
  const toneLabel = TONE_MAP[tone] || TONE_MAP.casual;
  const french = lang === "fr";
  const email = isEmailPlatform(platform);

  return `You are an elite creator outreach strategist. Generate the best possible ${email ? "cold email" : "cold DM"} outreach for influencer partnerships.

Mission: produce outreach that matches every filter below, answers a genuine partnership request (real value for the creator and their audience), and applies top-performing patterns from cold ${email ? "email" : "DM"} campaigns in this market.

Before writing (reason internally — do NOT output your analysis):
1. What creators in the "${creator.niche || "general"}" niche typically respond to right now
2. Cold ${email ? "email" : "DM"} behaviors and reply triggers in this vertical
3. How the "${toneLabel}" tone should shape length, vocabulary, and CTA
4. One specific, credible hook from the creator profile — never generic flattery

Creator profile:
- Name: ${creator.displayName}
- Handle: @${creator.username}
- Platform: ${creator.platform}
- Niche: ${creator.niche || "unknown"}
- Followers: ${creator.followersCount}
- Engagement rate: ${creator.engagementRate}%
- Bio: ${creator.bio || "(empty)"}

Brand / offer:
- Product or brand: ${brand}

Filters (must match exactly):
- Send channel: ${platform}
- Tone: ${toneLabel}

${channelRules(platform)}

Global quality bar:
- Elite-tier outreach only — what top brands and agencies would actually send
- Reference something specific and defensible about their niche or positioning
- Partnership opportunity must feel real, not a mass blast
- Sound like a founder or partnerships lead, not a marketing automation tool
- No hashtags; emojis only if tone is casual and channel is DM (max 1)
- Write in ${french ? "French" : "English"}

Output format (strict):
${
  email
    ? `Line 1: SUBJECT: [subject line]
Line 2: blank
Line 3+: email body only (no "Subject:" repeat in body)`
    : `DM body text only — no subject line, no labels, no markdown headers`
}

Output ONLY the outreach text. No preamble, no explanation, no quotes around the message.`;
}

export function parseOutreachGenerationResponse(
  raw: string,
  platform: string,
): { message: string; subject?: string } {
  const text = raw.trim();
  if (!isEmailPlatform(platform)) {
    return { message: text };
  }

  const subjectMatch = text.match(/^SUBJECT:\s*(.+?)(?:\n\n|\n---\n|\r\n\r\n)/i);
  if (subjectMatch) {
    const subject = subjectMatch[1].trim();
    const body = text.slice(subjectMatch[0].length).trim();
    return { subject, message: body };
  }

  const lines = text.split("\n");
  if (lines[0]?.toUpperCase().startsWith("SUBJECT:")) {
    const subject = lines[0].replace(/^SUBJECT:\s*/i, "").trim();
    const body = lines.slice(1).join("\n").trim();
    return { subject, message: body };
  }

  return { message: text };
}
