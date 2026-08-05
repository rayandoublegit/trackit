export type PlanTier = "free" | "basic" | "pro" | "scale";

export const FREE_LIFETIME_DISCOVERIES = 2;
export const BASIC_MONTHLY_DISCOVERIES = 30;
export const PRO_MONTHLY_DISCOVERIES = 100;

export const FREE_RESULTS_PER_SEARCH = 10;
/** Same results-per-search quota for all paid plans (Starter / Pro / Scale). */
export const PAID_RESULTS_PER_SEARCH = 20;
/** @deprecated Use PAID_RESULTS_PER_SEARCH — kept for older imports. */
export const BASIC_RESULTS_PER_SEARCH = PAID_RESULTS_PER_SEARCH;
/** @deprecated Use PAID_RESULTS_PER_SEARCH — kept for older imports. */
export const PRO_RESULTS_PER_SEARCH = PAID_RESULTS_PER_SEARCH;

/** Real campaigns only — Trackit demo campaign is hors quota. */
export const FREE_MAX_CAMPAIGNS = 1;
export const BASIC_MAX_CAMPAIGNS = 5;
export const PRO_MAX_CAMPAIGNS = 15;

export const FREE_MAX_MANAGED_CREATORS = 3;
export const FREE_MAX_MANUAL_SALES = 10;
/** @deprecated Paid plans have unlimited tracked creators. */
export const BASIC_MAX_MANAGED_CREATORS = Number.POSITIVE_INFINITY;
/** @deprecated Paid plans have unlimited tracked creators. */
export const PRO_MAX_MANAGED_CREATORS = Number.POSITIVE_INFINITY;

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

/** Max creators shown per search (Free 10, everyone else 20). */
export function getResultsPerSearchLimit(plan: PlanTier): number {
  if (plan === "free") return FREE_RESULTS_PER_SEARCH;
  return PAID_RESULTS_PER_SEARCH;
}

export function hasUnlimitedSearchResults(_plan: PlanTier): boolean {
  return false;
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

/** @deprecated No monthly AI quota — Pro / Business only. */
export const BASIC_MONTHLY_AI_MESSAGES = 0;

/** AI outreach: Pro + Business (scale) only — no message quota. */
export function canUseAIOutreach(plan: PlanTier): boolean {
  return isProOrAbove(plan);
}

/** @deprecated Alias of canUseAIOutreach — no monthly cap when allowed. */
export function canUseUnlimitedAIOutreach(plan: PlanTier): boolean {
  return canUseAIOutreach(plan);
}

/**
 * @deprecated Prefer canUseAIOutreach.
 * `null` = allowed (unlimited), `0` = locked (Free / Starter).
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

/** Returns true when AI generation is allowed (Pro / Business). */
export function canGenerateAiOutreach(plan: PlanTier, _userId?: string | null): boolean {
  return canUseAIOutreach(plan);
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
