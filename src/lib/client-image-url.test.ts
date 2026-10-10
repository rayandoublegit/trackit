import { describe, it, expect } from "vitest";
import { clientImageUrl, isHeicImageUrl, unwrapImageSource } from "@/lib/client-image-url";

describe("Instagram CDN and route unwrapping", () => {
  it("proxies Instagram / Facebook CDN images", () => {
    expect(clientImageUrl("https://scontent.cdninstagram.com/v/a.jpg")).toContain("/api/img-proxy?url=");
    expect(clientImageUrl("https://scontent-cdg4-1.xx.fbcdn.net/v/a.jpg")).toContain("/api/img-proxy?url=");
  });

  it("unwraps our image routes to the remote URL", () => {
    const cdn = "https://p16-sign.tiktokcdn.com/a.jpg";
    expect(unwrapImageSource(`/api/img-proxy?url=${encodeURIComponent(cdn)}`)).toBe(cdn);
    expect(unwrapImageSource(`/api/creator-avatar?username=a&src=${encodeURIComponent(cdn)}`)).toBe(cdn);
    expect(unwrapImageSource("/api/creator-avatar?username=a")).toBe("");
    expect(unwrapImageSource(cdn)).toBe(cdn);
  });
});

describe("clientImageUrl", () => {
  it("proxies TikTok CDN", () => {
    const cdn = "https://p16-sign.tiktokcdn-us.com/obj/foo.jpg";
    expect(clientImageUrl(cdn)).toContain("/api/img-proxy?url=");
  });

  it("proxies HEIC covers", () => {
    const heic = "https://p16-sign.tiktokcdn.com/foo.heic";
    expect(isHeicImageUrl(heic)).toBe(true);
    expect(clientImageUrl(heic)).toContain("/api/img-proxy?url=");
  });

  it("keeps Supabase URLs direct", () => {
    const url = "https://xyz.supabase.co/storage/v1/object/public/avatars/x.jpg";
    expect(clientImageUrl(url)).toBe(url);
  });
});
