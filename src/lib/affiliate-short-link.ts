import { randomBytes } from "crypto";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const TRACKIT_LINK_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://thentrack.it"
).replace(/\/$/, "");

export function buildTrackitShortLink(slug: string): string {
  const clean = slug.trim().toLowerCase();
  return `${TRACKIT_LINK_ORIGIN}/l/${encodeURIComponent(clean)}`;
}

/** 6–8 char lowercase alphanumeric slug. */
export function generateAffiliateSlug(length = 7): string {
  const size = Math.min(8, Math.max(6, length));
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

export function normalizeDestinationUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("destination_url required");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("invalid destination_url");
  }
  return url.toString();
}

export function normalizeCreatorUsername(raw: string): string {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  if (!handle) throw new Error("creator_username required");
  return handle;
}

export type CreateAffiliateLinkResponse = {
  ok: boolean;
  id?: string;
  slug?: string;
  link?: string;
  destination_url?: string;
  error?: string;
  errorFr?: string;
};

export async function createAffiliateShortLink(input: {
  brandId: string;
  creatorUsername: string;
  destinationUrl: string;
  campaignId?: string | null;
}): Promise<CreateAffiliateLinkResponse> {
  const res = await fetch("/api/links/create", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: input.brandId,
      creatorUsername: input.creatorUsername,
      destinationUrl: input.destinationUrl,
      campaignId: input.campaignId || undefined,
    }),
  });
  return (await res.json()) as CreateAffiliateLinkResponse;
}
