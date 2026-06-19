export type PlanTier = "free" | "basic" | "pro" | "scale";

export const FREE_LIFETIME_DISCOVERIES = 5;
export const BASIC_MONTHLY_DISCOVERIES = 20;
export const PRO_MONTHLY_DISCOVERIES = 50;

export const FREE_RESULTS_PER_SEARCH = 5;
export const BASIC_RESULTS_PER_SEARCH = 10;
export const PRO_RESULTS_PER_SEARCH = 25;

export const FREE_MAX_CAMPAIGNS = 0;
export const BASIC_MAX_CAMPAIGNS = 3;
export const PRO_MAX_CAMPAIGNS = 15;

export const FREE_MAX_MANAGED_CREATORS = 3;
export const BASIC_MAX_MANAGED_CREATORS = 15;
export const PRO_MAX_MANAGED_CREATORS = 50;

export const BASIC_MAX_SHOPIFY_STORES = 0;
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

/** Discovery cap; free = lifetime pool, basic = monthly pool, `null` = unlimited (Pro + Scale). */
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
  return isProOrAbove(plan);
}

/** Max creators shown per search; `null` = unlimited (Pro + Scale). */
export function getResultsPerSearchLimit(plan: PlanTier): number | null {
  if (plan === "free") return FREE_RESULTS_PER_SEARCH;
  if (plan === "basic") return BASIC_RESULTS_PER_SEARCH;
  if (plan === "pro") return PRO_RESULTS_PER_SEARCH;
  return null;
}

export function hasUnlimitedSearchResults(plan: PlanTier): boolean {
  return isProOrAbove(plan);
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

export const BASIC_MONTHLY_AI_MESSAGES = 100;

/** Pro + Scale: unlimited AI outreach. Basic: 50/month. */
export function canUseUnlimitedAIOutreach(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Monthly AI message cap; `null` = unlimited (Pro + Scale), 0 = none (free). */
export function getMonthlyAIMessageLimit(plan: PlanTier): number | null {
  if (plan === "free") return 0;
  if (plan === "basic") return BASIC_MONTHLY_AI_MESSAGES;
  return null;
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

/** Scale only: Stripe Connect auto payouts. */
export function canUseStripeConnectPayouts(plan: PlanTier): boolean {
  return plan === "scale";
}

export function canUseFullAnalytics(plan: PlanTier): boolean {
  return isGrowthOrAbove(plan);
}

export function canUseAdvancedAnalytics(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** Pro + Scale only: Shopify integration + per-creator sales tracking. */
export function canUseShopify(plan: PlanTier): boolean {
  return isProOrAbove(plan);
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
  return isProOrAbove(plan);
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
