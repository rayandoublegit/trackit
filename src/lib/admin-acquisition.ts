// Where signups come from, and how each source converts. Pure: no I/O.
import { billingOf, isPaying, type BillingProfile } from "@/lib/admin-billing";

export type AcqChannel = "tiktok" | "instagram" | "youtube" | "twitter" | "reddit" | "google" | "friend" | "other" | "unknown";

export const ACQ_CHANNELS: AcqChannel[] = ["tiktok", "instagram", "youtube", "twitter", "reddit", "google", "friend", "other", "unknown"];

const RULES: [RegExp, AcqChannel][] = [
  [/tik ?tok|^tt$/, "tiktok"],
  [/insta|^ig$/, "instagram"],
  [/you ?tube|^yt$/, "youtube"],
  [/twitter|^x$|^x \(|x\.com/, "twitter"],
  [/reddit/, "reddit"],
  [/google|seo|search|recherche/, "google"],
  [/friend|ami|word of mouth|bouche|referr|recommand|parrain/, "friend"],
];

function match(value: string): AcqChannel | null {
  for (const [re, channel] of RULES) if (re.test(value)) return channel;
  return null;
}

/**
 * Onboarding stores lowercase keys (tiktok, instagram, …), older rows may hold
 * free text. "other" is refined with its details ("Other: a YouTube video").
 */
export function normalizeAcquisitionSource(source: string | null | undefined, details?: string | null): AcqChannel {
  const value = (source ?? "").trim().toLowerCase();
  if (!value || value === "(not specified)") return "unknown";
  if (value === "other") return match((details ?? "").trim().toLowerCase()) ?? "other";
  return match(value) ?? "other";
}

export type AcqProfile = BillingProfile & {
  referral_source: string | null;
  onboarding_completed: boolean | null;
  created_at: string | null;
  details?: string | null;
};

export type FunnelRow = {
  key: AcqChannel | "all";
  signups: number;
  onboarded: number;
  paying: number;
  /** signups → onboarded */
  onboardRatePct: number | null;
  /** onboarded → paying */
  payFromOnboardedPct: number | null;
  /** signups → paying */
  payRatePct: number | null;
};

export type AcquisitionFunnel = { total: FunnelRow; bySource: FunnelRow[] };

function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

function row(key: FunnelRow["key"], signups: number, onboarded: number, paying: number): FunnelRow {
  return {
    key,
    signups,
    onboarded,
    paying,
    onboardRatePct: rate(onboarded, signups),
    payFromOnboardedPct: rate(paying, onboarded),
    payRatePct: rate(paying, signups),
  };
}

/**
 * Funnel signup → onboarded → paying, overall and per source. Paying follows
 * billingOf (Stripe or Whop, never comped access); a payer always counts as
 * onboarded. `sinceMs` keeps only accounts created on or after that time.
 */
export function acquisitionFunnel(rows: AcqProfile[], opts: { sinceMs?: number; now?: number } = {}): AcquisitionFunnel {
  const now = opts.now ?? Date.now();
  const tally = new Map<AcqChannel, { s: number; o: number; p: number }>();
  let s = 0;
  let o = 0;
  let p = 0;
  for (const r of rows) {
    if (opts.sinceMs !== undefined) {
      const t = Date.parse(r.created_at ?? "");
      if (!Number.isFinite(t) || t < opts.sinceMs) continue;
    }
    const paying = isPaying(billingOf(r, now).source);
    const onboarded = paying || r.onboarding_completed === true;
    const channel = normalizeAcquisitionSource(r.referral_source, r.details);
    const t = tally.get(channel) ?? { s: 0, o: 0, p: 0 };
    t.s += 1;
    if (onboarded) t.o += 1;
    if (paying) t.p += 1;
    tally.set(channel, t);
    s += 1;
    if (onboarded) o += 1;
    if (paying) p += 1;
  }
  const bySource = [...tally.entries()]
    .map(([key, t]) => row(key, t.s, t.o, t.p))
    .sort((a, b) => b.signups - a.signups || ACQ_CHANNELS.indexOf(a.key as AcqChannel) - ACQ_CHANNELS.indexOf(b.key as AcqChannel));
  return { total: row("all", s, o, p), bySource };
}
