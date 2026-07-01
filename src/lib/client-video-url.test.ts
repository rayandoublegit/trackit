import { describe, it, expect } from "vitest";
import { clientVideoUrl } from "./client-video-url";

describe("clientVideoUrl", () => {
  it("proxies tiktok video hosts", () => {
    const raw = "https://v16-webapp.tiktok.com/video/tos.mp4";
    expect(clientVideoUrl(raw)).toBe(`/api/video-proxy?url=${encodeURIComponent(raw)}`);
  });

  it("rejects non-tiktok hosts", () => {
    expect(clientVideoUrl("https://evil.example/video.mp4")).toBe("");
  });
});
