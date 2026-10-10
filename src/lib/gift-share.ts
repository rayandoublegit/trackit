import { GiftRuleError, giftExpectedCount, parseGiftCampaignRights, type GiftStatus } from "@/lib/gifting";

// Public share links of gift campaigns and the rules of an application made
// through them. Pure functions, used by the API, the public page and tests.

type Lang = "en" | "fr";

// ── Share token ─────────────────────────────────────────────

/** 24 random bytes → 32 url-safe characters (192 bits). */
export const GIFT_SHARE_TOKEN_BYTES = 24;
const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateGiftShareToken(): string {
  const bytes = new Uint8Array(GIFT_SHARE_TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** Shape check only (22–64 url-safe characters); existence is checked in the database. */
export function isGiftShareToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function giftSharePath(token: string, lang: Lang): string {
  return `${lang === "fr" ? "/fr" : ""}/gift/${token}`;
}

export function giftShareUrl(origin: string, token: string, lang: Lang): string {
  return `${origin.replace(/\/$/, "")}${giftSharePath(token, lang)}`;
}

// ── Campaign input ──────────────────────────────────────────

export const GIFT_PLATFORMS = ["tiktok", "instagram"] as const;
export type GiftPlatform = (typeof GIFT_PLATFORMS)[number];
export const GIFT_MAX_SPOTS = 500;
export const GIFT_MAX_PRODUCT_IMAGES = 4;
export const GIFT_PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Applications one creator account may send per hour, all campaigns together. */
export const GIFT_APPLY_MAX_PER_HOUR = 8;
export const GIFT_APPLICATION_MESSAGE_MAX = 500;
export const GIFT_PRODUCT_BUCKET = "gift-products";

export type GiftCampaignInput = {
  name: string;
  product: string;
  brief: string;
  offer: string;
  productValueCents: number;
  fixedFeeCents: number;
  deadline: string;
  videoCount: number;
  spots: number;
  autoApprove: boolean;
  minFollowers: number;
  platforms: GiftPlatform[];
  countries: string[];
  productImages: string[];
  allowAds: boolean;
  rightsDays: number;
  territories: string;
};

function text(value: unknown, label: string, max: number, required: boolean): string {
  const out = String(value ?? "").trim();
  if (required && !out) throw new GiftRuleError(`${label} is required.`);
  if (out.length > max) throw new GiftRuleError(`${label} is too long.`);
  return out;
}

function wholeNumber(value: unknown, label: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < min || n > max) {
    throw new GiftRuleError(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

/** Euros as typed by the brand ("45", "45,90") or cents, to cents. */
function money(euros: unknown, cents: unknown, label: string): number {
  if (cents !== undefined && cents !== null && cents !== "") return wholeNumber(cents, label, 0, 100_000_000, 0);
  if (euros === undefined || euros === null || euros === "") return 0;
  const n = Number(String(euros).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new GiftRuleError(`${label} is not a valid amount.`);
  return Math.round(n * 100);
}

export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseGiftPlatforms(value: unknown): GiftPlatform[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [...GIFT_PLATFORMS] : String(value).split(",");
  const out = [...new Set(list.map((p) => String(p).trim().toLowerCase()))];
  if (out.length === 0) throw new GiftRuleError("Pick at least one platform.");
  for (const p of out) {
    if (!(GIFT_PLATFORMS as readonly string[]).includes(p)) throw new GiftRuleError("Unknown platform.");
  }
  return out as GiftPlatform[];
}

/** ISO 3166-1 alpha-2 codes, upper case, from a list or "FR, BE". */
export function parseGiftCountries(value: unknown): string[] {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,\s;]+/);
  const out = [...new Set(list.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  if (out.length > 30) throw new GiftRuleError("Too many countries.");
  for (const c of out) if (!/^[A-Z]{2}$/.test(c)) throw new GiftRuleError("Use two-letter country codes (FR, BE…).");
  return out;
}

/**
 * Everything a brand sends to create a gift campaign, validated. `imagePrefix`
 * is the public URL folder where this brand's uploaded photos live: any other
 * image URL is refused (null: no photo accepted).
 */
export function parseGiftCampaignInput(
  body: Record<string, unknown>,
  opts: { today: string; imagePrefix: string | null },
): GiftCampaignInput {
  const name = text(body.name, "Name", 120, true);
  const product = text(body.product, "Product", 160, true);
  const brief = text(body.brief, "Brief", 2000, true);
  const offer = text(body.offer, "Offer", 300, false);
  const deadline = text(body.deadline, "Deadline", 10, true);
  if (!isIsoDay(deadline)) throw new GiftRuleError("Deadline is not a valid date.");
  if (deadline < opts.today) throw new GiftRuleError("Deadline is in the past.");
  const images = Array.isArray(body.productImages) ? body.productImages.map((u) => String(u).trim()).filter(Boolean) : [];
  if (images.length > GIFT_MAX_PRODUCT_IMAGES) throw new GiftRuleError("Too many photos.");
  for (const url of images) {
    if (!opts.imagePrefix || !url.startsWith(opts.imagePrefix) || url.length > 500 || /[\s"'<>]/.test(url)) {
      throw new GiftRuleError("Invalid photo.");
    }
  }
  const rights = parseGiftCampaignRights(body);
  return {
    name,
    product,
    brief,
    offer,
    productValueCents: money(body.productValue, body.productValueCents, "Product value"),
    fixedFeeCents: money(undefined, body.fixedFeeCents ?? 0, "Fee"),
    deadline,
    videoCount: giftExpectedCount(body.videoCount ?? body.contentCount),
    spots: wholeNumber(body.spots, "Spots", 1, GIFT_MAX_SPOTS, 10),
    autoApprove: body.autoApprove === true,
    minFollowers: wholeNumber(body.minFollowers, "Minimum followers", 0, 100_000_000, 0),
    platforms: parseGiftPlatforms(body.platforms),
    countries: parseGiftCountries(body.countries),
    productImages: [...new Set(images)],
    allowAds: rights.allowAds,
    rightsDays: rights.rightsDays,
    territories: rights.territories,
  };
}

/** The file's real type from its first bytes, never the name or the browser's claim. */
export function sniffGiftImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return { mime: "image/webp", ext: "webp" };
  return null;
}

// ── Availability (open, closed, full…) ──────────────────────

export type GiftCampaignState = {
  status: string;
  share_enabled?: boolean | null;
  deadline: string;
  spots?: number | null;
};

export type GiftAvailabilityReason = "open" | "closed" | "disabled" | "expired" | "full";

export type GiftAvailability = {
  open: boolean;
  reason: GiftAvailabilityReason;
  spots: number | null;
  taken: number;
  spotsLeft: number | null;
};

/** A mission holds a spot from the brand's yes onwards; applications and refusals do not. */
export function giftTakesSpot(status: string): boolean {
  return status !== "applied" && status !== "rejected" && status !== "declined";
}

export function giftCampaignAvailability(campaign: GiftCampaignState, taken: number, today: string): GiftAvailability {
  const spots = campaign.spots ?? null;
  const spotsLeft = spots === null ? null : Math.max(0, spots - taken);
  const base = { spots, taken, spotsLeft };
  if (campaign.status !== "active") return { ...base, open: false, reason: "closed" };
  if (campaign.share_enabled === false) return { ...base, open: false, reason: "disabled" };
  if (String(campaign.deadline).slice(0, 10) < today) return { ...base, open: false, reason: "expired" };
  if (spotsLeft === 0) return { ...base, open: false, reason: "full" };
  return { ...base, open: true, reason: "open" };
}

// ── Requirements and the application itself ─────────────────

export type GiftCreatorStats = {
  followers: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  country: string | null;
  avatarUrl: string | null;
  displayName: string | null;
};

/** creators_index stores Instagram creators as ig_<handle>, TikTok ones as the bare handle. */
export function creatorsIndexKey(platform: GiftPlatform, handle: string): string {
  return platform === "instagram" ? `ig_${handle}` : handle;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A creators_index row (any subset of columns) to the stats kept on the mission. */
export function giftCreatorStatsFromIndex(row: Record<string, unknown> | null | undefined): GiftCreatorStats | null {
  if (!row) return null;
  const country = typeof row.country_code === "string" && /^[A-Za-z]{2}$/.test(row.country_code) ? row.country_code.toUpperCase() : null;
  const avatar = typeof row.avatar_url === "string" && /^https:\/\//.test(row.avatar_url) ? row.avatar_url : null;
  return {
    followers: num(row.followers),
    avgViews: num(row.avg_views),
    engagementRate: num(row.engagement_rate),
    country,
    avatarUrl: avatar,
    displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim().slice(0, 120) : null,
  };
}

export type GiftRequirementFailure = "platform" | "followers" | "country";

export type GiftRequirementCheck = {
  ok: boolean;
  failures: GiftRequirementFailure[];
  /** A requirement could not be checked (no stats yet): the brand decides by hand. */
  needsReview: boolean;
};

export function checkGiftRequirements(
  campaign: { platforms?: string[] | null; min_followers?: number | null; countries?: string[] | null },
  platform: string,
  stats: GiftCreatorStats | null,
): GiftRequirementCheck {
  const failures: GiftRequirementFailure[] = [];
  let needsReview = false;
  const platforms = campaign.platforms?.length ? campaign.platforms : [...GIFT_PLATFORMS];
  if (!platforms.includes(platform)) failures.push("platform");
  const minFollowers = Number(campaign.min_followers) || 0;
  if (minFollowers > 0) {
    if (stats?.followers == null) needsReview = true;
    else if (stats.followers < minFollowers) failures.push("followers");
  }
  const countries = campaign.countries ?? [];
  if (countries.length > 0) {
    if (!stats?.country) needsReview = true;
    else if (!countries.includes(stats.country)) failures.push("country");
  }
  return { ok: failures.length === 0, failures, needsReview };
}

/** Auto-approve only when every requirement was checked and met; otherwise the brand reviews. */
export function giftApplicationStatus(autoApprove: boolean, check: GiftRequirementCheck): Extract<GiftStatus, "invited" | "applied"> {
  return autoApprove && check.ok && !check.needsReview ? "invited" : "applied";
}

/** "@Lea.Test", "tiktok.com/@lea.test", " lea.test " → "lea.test". Null when it cannot be a handle. */
export function normalizeApplicantHandle(raw: unknown): string | null {
  let value = String(raw ?? "").trim();
  const fromUrl = /(?:tiktok\.com\/@|instagram\.com\/)([A-Za-z0-9._]+)/i.exec(value);
  if (fromUrl) value = fromUrl[1];
  value = value.replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{2,30}$/.test(value) && !/^\.|\.$/.test(value) ? value : null;
}

export type GiftApplicationInput = { platform: GiftPlatform; handle: string; message: string };

export type GiftApplicationError = "terms" | "platform" | "handle" | "message";

export function parseGiftApplication(
  body: Record<string, unknown>,
  allowedPlatforms: string[] | null | undefined,
): { ok: true; value: GiftApplicationInput } | { ok: false; code: GiftApplicationError } {
  if (body.acceptTerms !== true) return { ok: false, code: "terms" };
  const platform = String(body.platform ?? "").toLowerCase();
  const allowed = allowedPlatforms?.length ? allowedPlatforms : [...GIFT_PLATFORMS];
  if (!(GIFT_PLATFORMS as readonly string[]).includes(platform) || !allowed.includes(platform)) return { ok: false, code: "platform" };
  const handle = normalizeApplicantHandle(body.handle);
  if (!handle) return { ok: false, code: "handle" };
  const message = String(body.message ?? "").trim();
  if (message.length > GIFT_APPLICATION_MESSAGE_MAX) return { ok: false, code: "message" };
  return { ok: true, value: { platform: platform as GiftPlatform, handle, message } };
}

// ── What the public page may show ───────────────────────────

export type PublicGiftCampaign = {
  token: string;
  name: string;
  product: string;
  brief: string;
  offer: string;
  productValueCents: number;
  fixedFeeCents: number;
  currency: string;
  images: string[];
  contentCount: number;
  deadline: string;
  allowAds: boolean;
  rightsDays: number;
  territories: string;
  platforms: GiftPlatform[];
  minFollowers: number;
  countries: string[];
  autoApprove: boolean;
  availability: GiftAvailability;
  brand: { name: string | null; logoUrl: string | null };
};

/**
 * Whitelist of campaign fields for the public page. Never the owner, the
 * workspace, the missions or anything else stored on the row.
 */
export function toPublicGiftCampaign(
  row: Record<string, unknown>,
  brand: { name: string | null; logoUrl: string | null },
  taken: number,
  today: string,
  opts: { brandCanPublish: boolean } = { brandCanPublish: true },
): PublicGiftCampaign {
  const platforms = (Array.isArray(row.platforms) ? row.platforms : [...GIFT_PLATFORMS]).filter((p): p is GiftPlatform =>
    (GIFT_PLATFORMS as readonly string[]).includes(String(p)),
  );
  const images = (Array.isArray(row.product_images) ? row.product_images : [])
    .map(String)
    .filter((u) => /^https:\/\//.test(u))
    .slice(0, GIFT_MAX_PRODUCT_IMAGES);
  const state: GiftCampaignState = {
    status: String(row.status ?? ""),
    share_enabled: opts.brandCanPublish ? (row.share_enabled as boolean | null | undefined) : false,
    deadline: String(row.deadline ?? ""),
    spots: num(row.spots),
  };
  return {
    token: String(row.share_token ?? ""),
    name: String(row.name ?? ""),
    product: String(row.product ?? ""),
    brief: String(row.brief ?? ""),
    offer: String(row.offer ?? ""),
    productValueCents: num(row.product_value_cents) ?? 0,
    fixedFeeCents: num(row.fixed_fee_cents) ?? 0,
    currency: typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : "EUR",
    images,
    contentCount: giftExpectedCount(row.video_count),
    deadline: String(row.deadline ?? "").slice(0, 10),
    allowAds: row.allow_ads === true,
    rightsDays: row.allow_ads === true ? num(row.rights_days) ?? 0 : 0,
    territories: row.allow_ads === true ? String(row.territories ?? "") : "",
    platforms: platforms.length ? platforms : [...GIFT_PLATFORMS],
    minFollowers: num(row.min_followers) ?? 0,
    countries: Array.isArray(row.countries) ? row.countries.map(String) : [],
    autoApprove: row.auto_approve === true,
    availability: giftCampaignAvailability(state, taken, today),
    brand,
  };
}

// ── Copy shared by the brand panel and the public page ──────

export function giftShareMessage(input: { brandName: string; product: string; url: string; lang: Lang }): string {
  const { brandName, product, url } = input;
  return input.lang === "fr"
    ? `Salut ! ${brandName} t’offre ${product} en échange d’un contenu. Toutes les infos et l’inscription ici : ${url}`
    : `Hi! ${brandName} is gifting ${product} in exchange for content. All the details and sign-up here: ${url}`;
}

export function formatFollowers(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
