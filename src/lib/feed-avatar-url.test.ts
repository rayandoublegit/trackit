import { describe, it, expect } from "vitest";
import { feedAvatarUrlForCreator, isStableAvatarStorageUrl } from "@/lib/feed-avatar-url";

describe("feedAvatarUrlForCreator", () => {
  it("uses stable Supabase URLs directly", () => {
    const url = "https://xyz.supabase.co/storage/v1/object/public/avatars/tiktok_foo.jpg";
    expect(feedAvatarUrlForCreator("foo", url)).toBe(url);
    expect(isStableAvatarStorageUrl(url)).toBe(true);
  });

  it("routes TikTok CDN through img-proxy", () => {
    const cdn = "https://p16-sign.tiktokcdn-us.com/obj/foo.jpg";
    expect(feedAvatarUrlForCreator("bar", cdn)).toBe(
      `/api/img-proxy?url=${encodeURIComponent(cdn)}`,
    );
  });

  it("falls back to API when avatar is missing or ui-avatars", () => {
    expect(feedAvatarUrlForCreator("baz", "")).toBe("/api/creator-avatar?username=baz");
    expect(feedAvatarUrlForCreator("baz", "https://ui-avatars.com/api/?name=baz")).toBe(
      "/api/creator-avatar?username=baz",
    );
  });
});
