import { describe, it, expect } from "vitest";
import { extractVideoId, videoEmbedUrl, videoEmbedPlayUrl } from "@/lib/creator-video";

describe("extractVideoId", () => {
  it("pulls the id from a standard share url", () => {
    expect(extractVideoId("https://www.tiktok.com/@sarah.fit/video/7311234567890123456")).toBe(
      "7311234567890123456"
    );
  });
  it("ignores query strings", () => {
    expect(extractVideoId("https://www.tiktok.com/@x/video/123456?lang=en")).toBe("123456");
  });
  it("accepts a bare numeric id", () => {
    expect(extractVideoId("7311234567890123456")).toBe("7311234567890123456");
  });
  it("returns null for junk or missing input", () => {
    expect(extractVideoId("garbage")).toBeNull();
    expect(extractVideoId(undefined)).toBeNull();
    expect(extractVideoId(null)).toBeNull();
    expect(extractVideoId("")).toBeNull();
  });
});

describe("videoEmbedUrl", () => {
  it("builds an embed url from an id", () => {
    expect(videoEmbedUrl("7311234567890123456")).toBe(
      "https://www.tiktok.com/embed/v2/7311234567890123456"
    );
  });
  it("builds from a share url", () => {
    expect(videoEmbedUrl("https://www.tiktok.com/@x/video/123456")).toBe(
      "https://www.tiktok.com/embed/v2/123456"
    );
  });
  it("prefers id then falls back to shareUrl on an object", () => {
    expect(
      videoEmbedUrl({ id: "7311234567890123456", shareUrl: "https://www.tiktok.com/@x/video/123456" })
    ).toBe("https://www.tiktok.com/embed/v2/7311234567890123456");
    expect(videoEmbedUrl({ id: "", shareUrl: "https://www.tiktok.com/@x/video/123456" })).toBe(
      "https://www.tiktok.com/embed/v2/123456"
    );
  });
  it("returns null when no id can be derived", () => {
    expect(videoEmbedUrl(null)).toBeNull();
    expect(videoEmbedUrl({ id: "", shareUrl: "nope" })).toBeNull();
  });
});

describe("videoEmbedPlayUrl", () => {
  it("adds autoplay to an existing embed url", () => {
    expect(videoEmbedPlayUrl("https://www.tiktok.com/embed/v2/123456")).toBe(
      "https://www.tiktok.com/embed/v2/123456?autoplay=1"
    );
  });
});
