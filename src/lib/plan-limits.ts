export type PlanTier = "free" | "basic" | "pro" | "scale";

// ── Plan matrix (single source of truth) ─────────────────────────────────────
// Free   : teaser only. First results of each search, no live lookup, no Mino
//          analysis, creator emails hidden, no tracking, no AI drafts, no gifting links.
// Growth : creator search without limits (catalog, live lookup, Mino searches and
//          site/photo analysis; hourly anti-abuse limits only), emails visible.
// Pro    : the whole product (Find It inbox, Trackit tracking, payouts, AI drafts,
//          gifting share links, creator portal, scripts, templates, automation).
// Scale  : Pro + team members in the brand workspace.

/** Free: discovery filter changes over the account's lifetime (teaser). */
export const FREE_LIFETIME_DISCOVERIES = 2;
/** @deprecated Growth has unlimited discoveries; kept for older imports. */
export const BASIC_MONTHLY_DISCOVERIES = Number.POSITIVE_INFINITY;
/** @deprecated Pro has unlimited discoveries; kept for older imports. */
export const PRO_MONTHLY_DISCOVERIES = Number.POSITIVE_INFINITY;

/** Free: creators the catalog API returns per search / filter set (hard wall, server-side). */
export const FREE_RESULTS_PER_SEARCH = 10;
/** Free: videos the video library API returns per filter set (hard wall, server-side). */
export const FREE_VIDEO_RESULTS_PER_SEARCH = 12;
/** @deprecated Paid plans are not capped per search any more. */
export const PAID_RESULTS_PER_SEARCH = Number.POSITIVE_INFINITY;
/** @deprecated Use PAID_RESULTS_PER_SEARCH — kept for older imports. */
export const BASIC_RESULTS_PER_SEARCH = PAID_RESULTS_PER_SEARCH;
/** @deprecated Use PAID_RESULTS_PER_SEARCH — kept for older imports. */
export const PRO_RESULTS_PER_SEARCH = PAID_RESULTS_PER_SEARCH;

/** Hourly anti-abuse limits per workspace owner (Growth and above). Env overrides win. */
export const LIVE_LOOKUP_MAX_PER_HOUR = 60;
export const MINO_ANALYSIS_MAX_PER_HOUR = 30;

/** Campaigns (Trackit) are Pro and above, unlimited. Free / Growth: none. */
export const FREE_MAX_CAMPAIGNS = 0;
export const BASIC_MAX_CAMPAIGNS = 0;
/** @deprecated Pro campaigns are unlimited. */
export const PRO_MAX_CAMPAIGNS = Number.POSITIVE_INFINITY;

export const FREE_MAX_MANAGED_CREATORS = 3;
export const FREE_MAX_MANUAL_SALES = 10;
/** @deprecated Paid plans have unlimited tracked creators. */
export const BASIC_MAX_MANAGED_CREATORS = Number.POSITIVE_INFINITY;
/** @deprecated Paid plans have unlimited tracked creators. */
export const PRO_MAX_MANAGED_CREATORS = Number.POSITIVE_INFINITY;

/** Shopify (sales tracking) is part of Trackit: Pro and Scale, up to 3 stores. */
export const BASIC_MAX_SHOPIFY_STORES = 0;
export const PRO_MAX_SHOPIFY_STORES = 3;
export const SCALE_MAX_SHOPIFY_STORES = 3;

/** Map DB / Stripe metadata values to dashboard plan tier. */
export function normalizePlan(plan: string | null | undefined): PlanTier {
  const p = (plan ?? "free").toLowerCase().trim();
  if (p === "scale") return "scale";
  if (p === "pro" || p === "build") return "pro";
  if (p === "basic" || p === "growth" || p === "spark") return "basic";
  if (p === "free") return "free";
  return "free";
}

export function isGrowthOrAbove(plan: PlanTier): boolean {
  return plan !== "free";
}

export function isProOrAbove(plan: PlanTier): boolean {
  return plan === "pro" || plan === "scale";
}

export function isScalePlan(plan: PlanTier): boolean {
  return plan === "scale";
}

/** Discovery cap: Free = lifetime teaser pool, `null` = unlimited (Growth and above). */
export function getDailyDiscoveryLimit(plan: PlanTier): number | null {
  if (plan === "free") return FREE_LIFETIME_DISCOVERIES;
  return null;
}

export function hasDiscoveryDailyCap(plan: PlanTier): boolean {
  return getDailyDiscoveryLimit(plan) !== null;
}

export function hasUnlimitedDiscoveries(plan: PlanTier): boolean {
  return plan !== "free";
}

/** Creators shown per search: Free 10 (hard wall), `null` = no cap (Growth and above). */
export function getResultsPerSearchLimit(plan: PlanTier): number | null {
  if (plan === "free") return FREE_RESULTS_PER_SEARCH;
  return null;
}

/** Videos shown per filter set in the video library: Free 12, `null` = no cap. */
export function getVideoResultsPerSearchLimit(plan: PlanTier): number | null {
  if (plan === "free") return FREE_VIDEO_RESULTS_PER_SEARCH;
  return null;
}

export function hasUnlimitedSearchResults(plan: PlanTier): boolean {
  return getResultsPerSearchLimit(plan) === null;
}

export function getVisibleDiscoveryResults<T>(plan: PlanTier, creators: T[]): T[] {
  const limit = getResultsPerSearchLimit(plan);
  if (limit == null) return creators;
  return creators.slice(0, limit);
}

/**
 * Server-side hard wall for a paged list (catalog rows, videos).
 * Returns the offset/limit to actually query, and whether the caller is past the wall.
 * `cap` null = no wall.
 */
export function clampTeaserPage(
  cap: number | null,
  offset: number,
  limit: number,
): { offset: number; limit: number; walled: boolean } {
  const off = Math.max(0, Math.floor(offset) || 0);
  const lim = Math.max(0, Math.floor(limit) || 0);
  if (cap == null) return { offset: off, limit: lim, walled: false };
  if (off >= cap) return { offset: off, limit: 0, walled: true };
  return { offset: off, limit: Math.min(lim, cap - off), walled: false };
}

// ── Creator search (Growth and above) ───────────────────────────────────────

/** Live creator lookup from the search bar (an API call to the platform). */
export function canUseLiveLookup(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

/** Live keyword search of a platform when the catalog has nothing (Instagram, etc.). */
export function canUseLiveSearch(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

/** Mino brand analysis from a website or a photo (Claude vision). */
export function canUseMinoAnalysis(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

/** Creator contact emails (catalog rows, creator page, Mino cards, lookups). */
export function canSeeCreatorEmails(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

/** Hourly live lookups per workspace owner; `0` = none (Free). */
export function liveLookupHourlyLimit(plan: PlanTier): number {
  return canUseLiveLookup(plan) ? LIVE_LOOKUP_MAX_PER_HOUR : 0;
}

/** Hourly Mino analyses per workspace owner; `0` = none (Free). */
export function minoAnalysisHourlyLimit(plan: PlanTier): number {
  return canUseMinoAnalysis(plan) ? MINO_ANALYSIS_MAX_PER_HOUR : 0;
}

/** The lowest plan that passes a feature check (for 402 payloads and modals). */
export function lowestTierFor(check: (plan: PlanTier) => boolean): PlanTier {
  for (const tier of ["free", "basic", "pro", "scale"] as const) if (check(tier)) return tier;
  return "scale";
}

// ── Trackit: campaigns, links, codes, Shopify, analytics (Pro and above) ────

export function canUseTrackit(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** `null` = unlimited (Pro / Scale); 0 = campaigns locked (Free / Growth). */
export function getMaxActiveCampaigns(plan: PlanTier): number | null {
  if (isProOrAbove(plan)) return null;
  if (plan === "basic") return BASIC_MAX_CAMPAIGNS;
  return FREE_MAX_CAMPAIGNS;
}

/** Free only; `null` = unlimited for all paid plans. */
export function getMaxManagedCreators(plan: PlanTier): number | null {
  if (plan === "free") return FREE_MAX_MANAGED_CREATORS;
  return null;
}

export function hasReachedCampaignLimit(plan: PlanTier, campaignCount: number): boolean {
  const max = getMaxActiveCampaigns(plan);
  if (max == null) return false;
  return campaignCount >= max;
}

export function hasReachedManagedCreatorLimit(plan: PlanTier, creatorCount: number): boolean {
  const max = getMaxManagedCreators(plan);
  if (max == null) return false;
  return creatorCount >= max;
}

/** Manual sales cap; free = 10 total manual sales, paid plans = unlimited. */
export function getManualSalesLimit(plan: PlanTier): number | null {
  if (plan === "free") return FREE_MAX_MANUAL_SALES;
  return null;
}

export function hasReachedManualSalesLimit(plan: PlanTier, manualSalesCount: number): boolean {
  const max = getManualSalesLimit(plan);
  if (max == null) return false;
  return manualSalesCount >= max;
}

/** @deprecated No monthly AI quota — Pro / Scale only. */
export const BASIC_MONTHLY_AI_MESSAGES = 0;

/** AI-written outreach / email drafts: Pro + Scale, no message quota. */
export function canUseAIOutreach(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** @deprecated Alias of canUseAIOutreach — no monthly cap when allowed. */
export function canUseUnlimitedAIOutreach(plan: PlanTier): boolean {
  return canUseAIOutreach(plan);
}

/**
 * @deprecated Prefer canUseAIOutreach.
 * `null` = allowed (unlimited), `0` = locked (Free / Growth).
 */
export function getMonthlyAIMessageLimit(plan: PlanTier): number | null {
  return canUseAIOutreach(plan) ? null : 0;
}

/** @deprecated Monthly AI usage tracking removed. */
export function getAiOutreachUsageStorageKey(_userId?: string | null): string {
  return "trackit_ai_outreach_deprecated";
}

/** @deprecated Monthly AI usage tracking removed. */
export function readAiOutreachUsage(_userId?: string | null): number {
  return 0;
}

/** @deprecated Monthly AI usage tracking removed. */
export function incrementAiOutreachUsage(_userId?: string | null): number {
  return 0;
}

/** Returns true when AI generation is allowed (Pro / Scale). */
export function canGenerateAiOutreach(plan: PlanTier, _userId?: string | null): boolean {
  return canUseAIOutreach(plan);
}

/** Outreach templates (save, import, reuse): Pro and above. */
export function canImportTemplates(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canPersistTemplates(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canCreateTemplates(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Pro + Scale: bulk CSV template import. */
export function canBulkImportTemplatesCsv(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canBulkImportCreatorsCsv(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Payouts (manual, automatic, Stripe Connect, balance): Pro and above. */
export function canUseManualPayouts(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseAutoPayouts(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseStripeConnectPayouts(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Brand wallet balance (fund account & pay creators): Pro and above. */
export function canUseBalance(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseFullAnalytics(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseAdvancedAnalytics(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Pro + Scale: invite creators, creator portal access, brand-side scripts. */
export function canInviteCreators(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseCreatorPortal(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseScripts(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** "Find It" inbox (content received from creators): Pro and above. */
export function canUseFindItInbox(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Gifting campaigns with a live public share link (and missions by handle): Pro and above, unlimited. */
export function canPublishGiftLinks(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Shopify integration + per-creator sales tracking: Pro and above. */
export function canUseShopify(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Tracked affiliate links and codes: Pro and above. */
export function canUseAffiliates(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseAutoFollowUp(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseAutomationWorkflows(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseFullAutomationAgent(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canChangeShopifyStore(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function maxShopifyStores(plan: PlanTier): number {
  if (plan === "scale") return SCALE_MAX_SHOPIFY_STORES;
  if (plan === "pro") return PRO_MAX_SHOPIFY_STORES;
  if (plan === "basic") return BASIC_MAX_SHOPIFY_STORES;
  return 0;
}

export function canAddAnotherShopifyStore(plan: PlanTier, connectedCount: number): boolean {
  return connectedCount < maxShopifyStores(plan);
}

/** Priority support: Pro and Scale (same level). */
export function canUsePrioritySupport(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** @deprecated Scale no longer has a separate support level; same as priority support. */
export function canUseDedicatedSupport(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Remove Trackit branding from outreach: Pro and above. */
export function canUseWhiteLabelOutreach(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

// ── Scale only ──────────────────────────────────────────────────────────────

/** Invite team members (colleagues) into the brand workspace: Scale only. */
export function canInviteTeamMembers(plan: PlanTier): boolean {
  return plan === "scale";
}
