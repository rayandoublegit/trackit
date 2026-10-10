import type { PlanTier } from "@/lib/plan-limits";

// The one 402 payload every gated API route returns, and the helpers both
// sides use (client-safe: no server imports).
//
//   HTTP 402 { ok: false, error: "plan_required" | "quota_exceeded", feature,
//              used, limit, requiredTier, resetsAt }
//
// "plan_required": the plan does not include the feature (upgrade).
// "quota_exceeded": reserved for numeric plan caps; hourly anti-abuse limits
// answer 429 rate_limited instead (they are not an upgrade reason).

/** Paywalled API features; each maps to a GateFeatureKey of the upgrade modal. */
export type PaywallFeature =
  | "live-lookup"
  | "mino-analysis"
  | "creator-emails"
  | "gifting-links"
  | "ai-outreach"
  | "campaigns"
  | "invitations";

export type PaywallBody = {
  ok: false;
  error: "plan_required" | "quota_exceeded";
  feature: PaywallFeature;
  used: number | null;
  limit: number | null;
  requiredTier: PlanTier;
  resetsAt: string | null;
  /** Optional human text (some routes keep their existing message field). */
  message?: string;
};

export function paywallBody(
  feature: PaywallFeature,
  requiredTier: PlanTier,
  extra: Partial<Pick<PaywallBody, "error" | "used" | "limit" | "resetsAt" | "message">> = {},
): PaywallBody {
  return {
    ok: false,
    error: extra.error ?? "plan_required",
    feature,
    used: extra.used ?? null,
    limit: extra.limit ?? null,
    requiredTier,
    resetsAt: extra.resetsAt ?? null,
    ...(extra.message ? { message: extra.message } : {}),
  };
}

const FEATURES = new Set<PaywallFeature>(["live-lookup", "mino-analysis", "creator-emails", "gifting-links", "ai-outreach", "campaigns", "invitations"]);

/** A 402 body from one of our routes, or null. */
export function readPaywall(status: number, body: unknown): PaywallBody | null {
  if (status !== 402 || !body || typeof body !== "object") return null;
  const b = body as Partial<PaywallBody>;
  if (b.error !== "plan_required" && b.error !== "quota_exceeded") return null;
  if (!b.feature || !FEATURES.has(b.feature)) return null;
  return b as PaywallBody;
}

// ── Creator emails ──────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const HIDDEN_EMAIL_TEXT = "•••@•••";

/** Text with every email address masked (bios often hold the contact email). */
export function maskEmails(text: string): string {
  return text.replace(EMAIL_RE, HIDDEN_EMAIL_TEXT);
}

export type EmailFields = { email?: string | null; bio?: string | null; hasEmail?: boolean; emailLocked?: boolean };

/**
 * A creator as a plan without emails sees it: no email, emails in the bio
 * masked, and `hasEmail` so the UI can show a locked chip.
 */
export function redactCreatorEmail<T extends EmailFields>(creator: T): T {
  const bio = typeof creator.bio === "string" ? creator.bio : null;
  const hasEmail = Boolean(creator.email && String(creator.email).trim()) || (bio ? bio.search(EMAIL_RE) >= 0 : false);
  EMAIL_RE.lastIndex = 0;
  return {
    ...creator,
    email: null,
    ...(bio !== null ? { bio: maskEmails(bio) } : {}),
    hasEmail,
    emailLocked: true,
  };
}

/** Applies redactCreatorEmail to a list when the plan hides emails. */
export function creatorsForPlan<T extends EmailFields>(creators: T[], emailsVisible: boolean): T[] {
  return emailsVisible ? creators : creators.map(redactCreatorEmail);
}
