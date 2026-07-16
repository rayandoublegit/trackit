import { describe, it, expect } from "vitest";
import { extractVideoId, tiktokVideoWatchUrl, videoEmbedUrl, videoEmbedPlayUrl } from "@/lib/creator-video";

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

describe("tiktokVideoWatchUrl", () => {
  it("keeps a normal share url", () => {
    expect(tiktokVideoWatchUrl("https://www.tiktok.com/@sarah.fit/video/7311234567890123456")).toBe(
      "https://www.tiktok.com/@sarah.fit/video/7311234567890123456"
    );
  });
  it("builds from id + username", () => {
    expect(tiktokVideoWatchUrl({ id: "123456", username: "sarah.fit" })).toBe(
      "https://www.tiktok.com/@sarah.fit/video/123456"
    );
  });
  it("builds from bare id without username", () => {
    expect(tiktokVideoWatchUrl("123456")).toBe("https://www.tiktok.com/video/123456");
  });
  it("returns null when no id can be derived", () => {
    expect(tiktokVideoWatchUrl(null)).toBeNull();
    expect(tiktokVideoWatchUrl({ id: "", shareUrl: "nope" })).toBeNull();
  });
});

describe("videoEmbedUrl (legacy alias)", () => {
  it("returns a watch url, not an embed url", () => {
    expect(videoEmbedUrl("7311234567890123456")).toBe("https://www.tiktok.com/video/7311234567890123456");
    expect(videoEmbedUrl("https://www.tiktok.com/@x/video/123456")).toBe(
      "https://www.tiktok.com/@x/video/123456"
    );
  });
});

describe("videoEmbedPlayUrl (legacy alias)", () => {
  it("returns a watch url", () => {
    expect(videoEmbedPlayUrl({ id: "123456", username: "x" })).toBe(
      "https://www.tiktok.com/@x/video/123456"
    );
  });
});
