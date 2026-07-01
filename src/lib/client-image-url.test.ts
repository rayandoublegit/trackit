import { describe, it, expect } from "vitest";
import { clientImageUrl, isHeicImageUrl } from "@/lib/client-image-url";

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
