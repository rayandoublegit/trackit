import { describe, it, expect } from "vitest";
import { buildEnrichmentRow } from "@/lib/creator-enrichment";
import type { VideoStat } from "@/lib/creator-metrics";

const NOW = Date.UTC(2026, 5, 21);
function vid(p: Partial<VideoStat>): VideoStat {
  return { playCount: 22000, likeCount: 1000, commentCount: 100, shareCount: 30, createTime: NOW / 1000 - 86400, isAd: false, ...p };
}

describe("buildEnrichmentRow", () => {
  it("assembles a row with real metrics + quality + enriched status", () => {
    const profile = { followers: 50_000, verified: true, bio: "coach", displayName: "Coach", videoCount: 80 };
    const row = buildEnrichmentRow("coach", profile, [vid({}), vid({ playCount: 24000 })], NOW);
    expect(row.username).toBe("coach");
    expect(row.followers).toBe(50_000);
    expect(row.avg_views).toBeGreaterThan(0);
    expect(row.engagement_rate).toBeGreaterThan(0);
    expect(row.authenticity_score).toBeGreaterThan(0);
    expect(row.quality_status).toBe("ok");
    expect(row.enrichment_status).toBe("enriched");
    expect(row.enriched_at).toBe(new Date(NOW).toISOString());
  });
});
