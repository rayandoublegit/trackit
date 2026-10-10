import { describe, expect, it } from "vitest";
import {
  FREE_RESULTS_PER_SEARCH,
  FREE_VIDEO_RESULTS_PER_SEARCH,
  LIVE_LOOKUP_MAX_PER_HOUR,
  MINO_ANALYSIS_MAX_PER_HOUR,
  canInviteCreators,
  canInviteTeamMembers,
  canPersistTemplates,
  canPublishGiftLinks,
  canSeeCreatorEmails,
  canUseAIOutreach,
  canUseAffiliates,
  canUseAutoPayouts,
  canUseBalance,
  canUseFindItInbox,
  canUseFullAnalytics,
  canUseFullAutomationAgent,
  canUseLiveLookup,
  canUseLiveSearch,
  canUseManualPayouts,
  canUseMinoAnalysis,
  canUseScripts,
  canUseShopify,
  canUseTrackit,
  clampTeaserPage,
  getDailyDiscoveryLimit,
  getMaxActiveCampaigns,
  getResultsPerSearchLimit,
  getVideoResultsPerSearchLimit,
  hasReachedCampaignLimit,
  liveLookupHourlyLimit,
  lowestTierFor,
  maxShopifyStores,
  minoAnalysisHourlyLimit,
  type PlanTier,
} from "@/lib/plan-limits";
import { FEATURE_GATES, getLimitUpgradeModalProps } from "@/lib/plan-marketing";
import { getPlanPricingHighlights, getPlanPricingFeatureLines } from "@/lib/plan-pricing-highlights";

const TIERS: PlanTier[] = ["free", "basic", "pro", "scale"];
const row = (check: (p: PlanTier) => boolean) => TIERS.map(check);

describe("plan matrix (lib/plan-limits)", () => {
  it("Free: teaser only — no live lookup, no Mino analysis, no emails, no tracking", () => {
    expect(canUseLiveLookup("free")).toBe(false);
    expect(canUseLiveSearch("free")).toBe(false);
    expect(canUseMinoAnalysis("free")).toBe(false);
    expect(canSeeCreatorEmails("free")).toBe(false);
    expect(canUseAIOutreach("free")).toBe(false);
    expect(canPublishGiftLinks("free")).toBe(false);
    expect(canUseTrackit("free")).toBe(false);
    expect(getResultsPerSearchLimit("free")).toBe(FREE_RESULTS_PER_SEARCH);
    expect(getVideoResultsPerSearchLimit("free")).toBe(FREE_VIDEO_RESULTS_PER_SEARCH);
  });

  it("Growth: unlimited creator search, live lookup, Mino analysis and emails; nothing of Pro", () => {
    expect(canUseLiveLookup("basic") && canUseLiveSearch("basic") && canUseMinoAnalysis("basic") && canSeeCreatorEmails("basic")).toBe(true);
    expect(getResultsPerSearchLimit("basic")).toBeNull();
    expect(getVideoResultsPerSearchLimit("basic")).toBeNull();
    expect(getDailyDiscoveryLimit("basic")).toBeNull();
    for (const proOnly of [canUseTrackit, canUseAffiliates, canUseShopify, canUseFullAnalytics, canUseManualPayouts, canUseAIOutreach, canPublishGiftLinks, canInviteCreators, canUseScripts, canPersistTemplates, canUseFindItInbox]) {
      expect(proOnly("basic")).toBe(false);
    }
    expect(hasReachedCampaignLimit("basic", 0)).toBe(true);
    expect(maxShopifyStores("basic")).toBe(0);
  });

  it("Pro: the whole product, unlimited (what was Scale-only is Pro now)", () => {
    for (const check of [canUseTrackit, canUseAffiliates, canUseShopify, canUseFullAnalytics, canUseManualPayouts, canUseAutoPayouts, canUseBalance, canUseFullAutomationAgent, canUseAIOutreach, canPublishGiftLinks, canInviteCreators, canUseScripts, canPersistTemplates, canUseFindItInbox]) {
      expect(check("pro")).toBe(true);
    }
    expect(getMaxActiveCampaigns("pro")).toBeNull();
    expect(getDailyDiscoveryLimit("pro")).toBeNull();
    expect(maxShopifyStores("pro")).toBe(maxShopifyStores("scale"));
    expect(canInviteTeamMembers("pro")).toBe(false);
  });

  it("Scale = Pro + team members, nothing else", () => {
    expect(row(canInviteTeamMembers)).toEqual([false, false, false, true]);
    for (const check of [canUseTrackit, canUseBalance, canUseAutoPayouts, canUseAIOutreach, canPublishGiftLinks, canSeeCreatorEmails, canUseLiveLookup]) {
      expect(check("scale")).toBe(check("pro"));
    }
    expect(getMaxActiveCampaigns("scale")).toBe(getMaxActiveCampaigns("pro"));
  });

  it("hourly anti-abuse limits: Growth and above only", () => {
    expect(TIERS.map(liveLookupHourlyLimit)).toEqual([0, LIVE_LOOKUP_MAX_PER_HOUR, LIVE_LOOKUP_MAX_PER_HOUR, LIVE_LOOKUP_MAX_PER_HOUR]);
    expect(TIERS.map(minoAnalysisHourlyLimit)).toEqual([0, MINO_ANALYSIS_MAX_PER_HOUR, MINO_ANALYSIS_MAX_PER_HOUR, MINO_ANALYSIS_MAX_PER_HOUR]);
    expect(LIVE_LOOKUP_MAX_PER_HOUR).toBe(60);
    expect(MINO_ANALYSIS_MAX_PER_HOUR).toBe(30);
  });

  it("lowestTierFor reads the required plan off a check", () => {
    expect(lowestTierFor(canUseLiveLookup)).toBe("basic");
    expect(lowestTierFor(canUseTrackit)).toBe("pro");
    expect(lowestTierFor(canInviteTeamMembers)).toBe("scale");
    expect(lowestTierFor(() => true)).toBe("free");
  });
});

describe("clampTeaserPage (server-side hard wall)", () => {
  it("no cap: passes offset and limit through", () => {
    expect(clampTeaserPage(null, 48, 24)).toEqual({ offset: 48, limit: 24, walled: false });
  });
  it("first page is cut to the cap, the next page is walled", () => {
    expect(clampTeaserPage(10, 0, 24)).toEqual({ offset: 0, limit: 10, walled: false });
    expect(clampTeaserPage(10, 6, 24)).toEqual({ offset: 6, limit: 4, walled: false });
    expect(clampTeaserPage(10, 10, 24)).toEqual({ offset: 10, limit: 0, walled: true });
    expect(clampTeaserPage(10, 1000, 1000)).toMatchObject({ limit: 0, walled: true });
  });
  it("ignores negative or junk values", () => {
    expect(clampTeaserPage(10, -5, Number.NaN)).toEqual({ offset: 0, limit: 0, walled: false });
  });
});

describe("upgrade gates follow the matrix", () => {
  it("required tiers come from plan-limits", () => {
    expect(FEATURE_GATES["live-lookup"].requiredTier).toBe("basic");
    expect(FEATURE_GATES["mino-analysis"].requiredTier).toBe("basic");
    expect(FEATURE_GATES["creator-emails"].requiredTier).toBe("basic");
    expect(FEATURE_GATES.discovery.requiredTier).toBe("basic");
    for (const key of ["gifting-links", "findit", "campaigns", "affiliates", "integrations", "payouts", "balance", "transactions", "analytics", "ai-outreach", "invitations", "scripts", "templates", "automation"] as const) {
      expect(FEATURE_GATES[key].requiredTier, key).toBe("pro");
    }
    expect(FEATURE_GATES["team-members"].requiredTier).toBe("scale");
  });
  it("every gate has French and English copy", () => {
    for (const [key, gate] of Object.entries(FEATURE_GATES)) {
      expect(gate.title.fr && gate.title.en && gate.description.fr && gate.description.en, key).toBeTruthy();
    }
  });
  it("campaign and store limits point to Pro, and Pro has no further limit modal", () => {
    expect(getLimitUpgradeModalProps("campaigns", "free", "fr")?.requiredTier).toBe("pro");
    expect(getLimitUpgradeModalProps("campaigns", "basic", "en")?.requiredTier).toBe("pro");
    expect(getLimitUpgradeModalProps("campaigns", "pro", "en")).toBeNull();
    expect(getLimitUpgradeModalProps("shopify-stores", "basic", "en")?.requiredTier).toBe("pro");
    expect(getLimitUpgradeModalProps("discoveries", "free", "en")?.requiredTier).toBe("basic");
    expect(getLimitUpgradeModalProps("discoveries", "basic", "en")).toBeNull();
  });
});

describe("pricing lists match the matrix", () => {
  it("Growth lists unlimited search, live lookup, Mino analysis and emails", () => {
    for (const lang of ["en", "fr"] as const) {
      const ids = getPlanPricingHighlights("basic", lang).map((h) => h.id);
      expect(ids).toEqual(expect.arrayContaining(["search", "live-lookup", "mino-analysis", "emails"]));
      expect(ids).not.toContain("trackit");
    }
  });
  it("Pro lists Find It, Trackit, payouts, AI drafts, gifting, portal, scripts and templates", () => {
    const ids = getPlanPricingHighlights("pro", "en").map((h) => h.id);
    expect(ids).toEqual(["includes-growth", "findit", "trackit", "shopify", "payout", "ai", "gifting", "creator-portal", "scripts"]);
  });
  it("Scale is Pro plus team members only", () => {
    for (const lang of ["en", "fr"] as const) {
      expect(getPlanPricingHighlights("scale", lang).map((h) => h.id)).toEqual(["includes-pro", "team"]);
    }
  });
  it("no monthly quota or Infinity leaks into the copy", () => {
    for (const tier of TIERS) {
      for (const lang of ["en", "fr"] as const) {
        const text = getPlanPricingFeatureLines(tier, lang).join(" ");
        expect(text).not.toMatch(/Infinity|\/ ?mois|\/ ?month|NaN/);
      }
    }
    expect(Object.values(FEATURE_GATES).map((g) => g.description.en + g.description.fr).join(" ")).not.toMatch(/Infinity|NaN/);
  });
});
