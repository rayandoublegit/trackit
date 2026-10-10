import { describe, it, expect } from "vitest";
import { avatarFallbacks, creatorAvatarApiUrl, feedAvatarUrlForCreator, isStableAvatarStorageUrl } from "@/lib/feed-avatar-url";

const cdn = "https://p16-sign.tiktokcdn-us.com/obj/foo.jpg";

describe("feedAvatarUrlForCreator", () => {
  it("uses stable Supabase URLs directly", () => {
    const url = "https://xyz.supabase.co/storage/v1/object/public/avatars/tiktok_foo.jpg";
    expect(feedAvatarUrlForCreator("foo", url)).toBe(url);
    expect(isStableAvatarStorageUrl(url)).toBe(true);
  });

  it("serves TikTok and Instagram CDN photos through the image proxy (no scrape on first paint)", () => {
    expect(feedAvatarUrlForCreator("bar", cdn)).toBe(`/api/img-proxy?url=${encodeURIComponent(cdn)}`);
    const ig = "https://scontent.cdninstagram.com/v/t51/foo.jpg";
    expect(feedAvatarUrlForCreator("ig_bar", ig)).toBe(`/api/img-proxy?url=${encodeURIComponent(ig)}`);
  });

  it("is stable when given its own output or an avatar route URL", () => {
    const once = feedAvatarUrlForCreator("bar", cdn);
    expect(feedAvatarUrlForCreator("bar", once)).toBe(once);
    expect(feedAvatarUrlForCreator("bar", creatorAvatarApiUrl("bar", cdn))).toBe(once);
  });

  it("falls back to API when avatar is missing or ui-avatars", () => {
    expect(feedAvatarUrlForCreator("baz", "")).toBe("/api/creator-avatar?username=baz");
    expect(feedAvatarUrlForCreator("baz", "https://ui-avatars.com/api/?name=baz")).toBe(
      "/api/creator-avatar?username=baz",
    );
  });

  it("supports force refresh", () => {
    expect(creatorAvatarApiUrl("qux", null, { refresh: true })).toBe(
      "/api/creator-avatar?username=qux&refresh=1",
    );
  });

  it("keeps the CDN hint when given a proxied URL", () => {
    expect(creatorAvatarApiUrl("bar", `/api/img-proxy?url=${encodeURIComponent(cdn)}`)).toBe(
      `/api/creator-avatar?username=bar&src=${encodeURIComponent(cdn)}`,
    );
  });
});

describe("avatarFallbacks", () => {
  it("goes to the avatar route, then a forced refresh, after a failed CDN photo", () => {
    const first = feedAvatarUrlForCreator("bar", cdn);
    expect(avatarFallbacks("bar", first, first)).toEqual([
      `/api/creator-avatar?username=bar&src=${encodeURIComponent(cdn)}`,
      "/api/creator-avatar?username=bar&refresh=1",
    ]);
  });

  it("only offers the refresh when the avatar route itself failed", () => {
    expect(avatarFallbacks("baz", "", "/api/creator-avatar?username=baz")).toEqual(["/api/creator-avatar?username=baz&refresh=1"]);
  });
});
