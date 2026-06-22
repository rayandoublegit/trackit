import Anthropic from "@anthropic-ai/sdk";

export interface CreatorClassification {
  primaryNiche: string;
  niches: string[];
  language: string; // ISO 639-1
  countryCode: string | null; // ISO 3166-1 alpha-2
  email: string | null;
  brandSafe: boolean;
}

export function buildClassificationPrompt(input: {
  displayName: string;
  bio: string;
  captions: string[];
}): string {
  const captions = input.captions.slice(0, 12).map((c) => `- ${c}`).join("\n");
  return `You classify social-media creators for a brand-partnership database.

Creator display name: ${input.displayName}
Bio: ${input.bio}
Recent video captions:
${captions || "(none)"}

Return ONLY a JSON object, no prose, with this exact shape:
{
  "primaryNiche": string,           // one lowercase word, e.g. "fitness"
  "niches": string[],               // 1-4 lowercase niche tags
  "language": string,               // ISO 639-1 of the creator's content, e.g. "fr"
  "countryCode": string | null,     // ISO 3166-1 alpha-2 if inferable, else null
  "email": string | null,           // contact email if present in bio, else null
  "brandSafe": boolean              // false if adult/hateful/dangerous content
}`;
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in classification output");
  return body.slice(start, end + 1);
}

export function parseClassification(text: string): CreatorClassification {
  const obj = JSON.parse(extractJson(text)) as Record<string, unknown>;
  const primaryNiche = String(obj.primaryNiche ?? "").toLowerCase().trim();
  if (!primaryNiche) throw new Error("classification missing primaryNiche");
  const niches = Array.isArray(obj.niches)
    ? obj.niches.map((n) => String(n).toLowerCase().trim()).filter(Boolean)
    : [primaryNiche];
  return {
    primaryNiche,
    niches: niches.length ? niches : [primaryNiche],
    language: String(obj.language ?? "").toLowerCase().trim() || "unknown",
    countryCode: obj.countryCode ? String(obj.countryCode).toUpperCase().slice(0, 2) : null,
    email: obj.email ? String(obj.email) : null,
    brandSafe: obj.brandSafe !== false,
  };
}

export async function classifyCreator(input: {
  displayName: string;
  bio: string;
  captions: string[];
}): Promise<CreatorClassification> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: buildClassificationPrompt(input) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseClassification(text);
}
