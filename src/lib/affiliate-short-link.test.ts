import { describe, expect, it } from "vitest";
import {
  buildAffiliateShortLink,
  buildTrackitShortLink,
  buildTrackitTrackingLink,
  destinationBaseUrl,
  destinationOrigin,
  normalizeDestinationUrl,
} from "./affiliate-short-link";

describe("destination helpers", () => {
  it("normalizes bare domains", () => {
    expect(normalizeDestinationUrl("myboost.com")).toBe("https://myboost.com/");
    expect(destinationOrigin("myboost.com")).toBe("https://myboost.com");
    expect(destinationBaseUrl("https://myboost.com/products/x")).toBe("https://myboost.com/");
  });
});

describe("buildAffiliateShortLink", () => {
  it("builds from destination host + slug", () => {
    expect(buildAffiliateShortLink("myboost.com", "xzfwxw9")).toBe("https://myboost.com/xzfwxw9");
    expect(buildAffiliateShortLink("https://www.shop.com/path", "abc1234")).toBe(
      "https://www.shop.com/abc1234",
    );
  });
});

describe("buildTrackitShortLink", () => {
  it("prefers destination-based links when provided", () => {
    expect(buildTrackitShortLink("xzfwxw9", "myboost.com")).toBe("https://myboost.com/xzfwxw9");
  });

  it("falls back to Trackit tracking hop without destination", () => {
    expect(buildTrackitShortLink("xzfwxw9")).toMatch(/\/l\/xzfwxw9$/);
    expect(buildTrackitTrackingLink("xzfwxw9")).toMatch(/\/l\/xzfwxw9$/);
  });
});
