export type PlanTier = "free" | "basic" | "pro" | "scale";

export const FREE_LIFETIME_DISCOVERIES = 10;
export const BASIC_MONTHLY_DISCOVERIES = 30;
export const PRO_MONTHLY_DISCOVERIES = 100;

export const FREE_RESULTS_PER_SEARCH = 15;
export const BASIC_RESULTS_PER_SEARCH = 25;
export const PRO_RESULTS_PER_SEARCH = 50;

export const FREE_MAX_CAMPAIGNS = 1;
export const BASIC_MAX_CAMPAIGNS = 5;
export const PRO_MAX_CAMPAIGNS = 15;

export const FREE_MAX_MANAGED_CREATORS = 5;
export const FREE_MAX_MANUAL_SALES = 10;
export const BASIC_MAX_MANAGED_CREATORS = 25;
export const PRO_MAX_MANAGED_CREATORS = 100;

export const BASIC_MAX_SHOPIFY_STORES = 1;
export const PRO_MAX_SHOPIFY_STORES = 1;
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

/** Discovery cap; free = lifetime pool, basic/pro = monthly pool, `null` = unlimited (Scale). */
export function getDailyDiscoveryLimit(plan: PlanTier): number | null {
  if (plan === "free") return FREE_LIFETIME_DISCOVERIES;
  if (plan === "basic") return BASIC_MONTHLY_DISCOVERIES;
  if (plan === "pro") return PRO_MONTHLY_DISCOVERIES;
  return null;
}

export function hasDiscoveryDailyCap(plan: PlanTier): boolean {
  return getDailyDiscoveryLimit(plan) !== null;
}

export function hasUnlimitedDiscoveries(plan: PlanTier): boolean {
  return plan === "scale";
}

/** Max creators shown per search; `null` = unlimited (Scale). */
export function getResultsPerSearchLimit(plan: PlanTier): number | null {
  if (plan === "free") return FREE_RESULTS_PER_SEARCH;
  if (plan === "basic") return BASIC_RESULTS_PER_SEARCH;
  if (plan === "pro") return PRO_RESULTS_PER_SEARCH;
  return null;
}

export function hasUnlimitedSearchResults(plan: PlanTier): boolean {
  return plan === "scale";
}

export function getVisibleDiscoveryResults<T>(plan: PlanTier, creators: T[]): T[] {
  const limit = getResultsPerSearchLimit(plan);
  if (limit == null) return creators;
  return creators.slice(0, limit);
}

/** `null` = unlimited (Scale). */
export function getMaxActiveCampaigns(plan: PlanTier): number | null {
  if (plan === "scale") return null;
  if (plan === "pro") return PRO_MAX_CAMPAIGNS;
  if (plan === "basic") return BASIC_MAX_CAMPAIGNS;
  return FREE_MAX_CAMPAIGNS;
}

/** `null` = unlimited (Scale). */
export function getMaxManagedCreators(plan: PlanTier): number | null {
  if (plan === "scale") return null;
  if (plan === "pro") return PRO_MAX_MANAGED_CREATORS;
  if (plan === "basic") return BASIC_MAX_MANAGED_CREATORS;
  return FREE_MAX_MANAGED_CREATORS;
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

export const BASIC_MONTHLY_AI_MESSAGES = 100;

/** Pro + Scale: unlimited AI outreach. Basic: 100/month. */
export function canUseUnlimitedAIOutreach(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Monthly AI message cap; `null` = unlimited (Pro + Scale), 0 = none (free). */
export function getMonthlyAIMessageLimit(plan: PlanTier): number | null {
  if (plan === "free") return 0;
  if (plan === "basic") return BASIC_MONTHLY_AI_MESSAGES;
  return null;
}

function aiOutreachMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Client-side monthly AI usage key (Starter quota). */
export function getAiOutreachUsageStorageKey(userId?: string | null): string {
  const uid = userId?.trim() || "anon";
  return `trackit_ai_outreach_${uid}_${aiOutreachMonthKey()}`;
}

export function readAiOutreachUsage(userId?: string | null): number {
  if (typeof window === "undefined") return 0;
  try {
    return Math.max(0, parseInt(localStorage.getItem(getAiOutreachUsageStorageKey(userId)) || "0", 10) || 0);
  } catch {
    return 0;
  }
}

export function incrementAiOutreachUsage(userId?: string | null): number {
  if (typeof window === "undefined") return 0;
  const next = readAiOutreachUsage(userId) + 1;
  try {
    localStorage.setItem(getAiOutreachUsageStorageKey(userId), String(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Returns true when generation is allowed; false when gated. */
export function canGenerateAiOutreach(plan: PlanTier, userId?: string | null): boolean {
  const limit = getMonthlyAIMessageLimit(plan);
  if (limit == null) return true;
  if (limit <= 0) return false;
  return readAiOutreachUsage(userId) < limit;
}

export function canImportTemplates(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

export function canPersistTemplates(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

export function canCreateTemplates(plan: PlanTier): boolean {
  return plan !== "free";
}

/** Pro + Scale: bulk CSV template import (Scale = unlimited volume). */
export function canBulkImportTemplatesCsv(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canBulkImportCreatorsCsv(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseManualPayouts(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

/** Pro + Scale: scheduled / manual auto-payout toggle. */
export function canUseAutoPayouts(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Pro + Scale: Stripe Connect auto payouts. */
export function canUseStripeConnectPayouts(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Scale only: brand wallet balance (fund account & pay creators). */
export function canUseBalance(plan: PlanTier): boolean {
  return plan === "scale";
}

export function canUseFullAnalytics(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

export function canUseAdvancedAnalytics(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Pro + Scale only: invite creators, creator portal access, brand-side scripts. */
export function canInviteCreators(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseCreatorPortal(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseScripts(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Starter+: Shopify integration + per-creator sales tracking. */
export function canUseShopify(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

export function canUseAffiliates(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

export function canUseAutoFollowUp(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Pro: workflow toggles; Scale: full automation agent. */
export function canUseAutomationWorkflows(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

export function canUseFullAutomationAgent(plan: PlanTier): boolean {
  return plan === "scale";
}

export function canChangeShopifyStore(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

export function maxShopifyStores(plan: PlanTier): number {
  if (plan === "scale") return SCALE_MAX_SHOPIFY_STORES;
  if (isProOrAbove(plan)) return PRO_MAX_SHOPIFY_STORES;
  if (plan === "basic") return BASIC_MAX_SHOPIFY_STORES;
  return 0;
}

export function canAddAnotherShopifyStore(plan: PlanTier, connectedCount: number): boolean {
  return connectedCount < maxShopifyStores(plan);
}

/** Pro: priority support; Scale: dedicated support. */
export function canUsePrioritySupport(plan: PlanTier): boolean {
  return plan === "pro";
}

export function canUseDedicatedSupport(plan: PlanTier): boolean {
  return plan === "scale";
}

/** Scale only: remove Trackit branding from outreach. */
export function canUseWhiteLabelOutreach(plan: PlanTier): boolean {
  return plan === "scale";
}
