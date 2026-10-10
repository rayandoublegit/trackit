import { describe, expect, it } from "vitest";
import { creatorStorageKey, storageKeyCandidates } from "./creator-storage-key";

describe("creatorStorageKey", () => {
  it("prefixes Instagram and YouTube handles", () => {
    expect(creatorStorageKey("@Foo", "Instagram")).toBe("ig_foo");
    expect(creatorStorageKey("foo", "youtube")).toBe("yt_foo");
    expect(creatorStorageKey("foo", "TikTok")).toBe("foo");
  });
  it("never prefixes twice", () => {
    expect(creatorStorageKey("ig_foo", "instagram")).toBe("ig_foo");
  });
});

describe("storageKeyCandidates", () => {
  it("keeps a prefixed key exact", () => {
    expect(storageKeyCandidates("ig_foo")).toEqual(["ig_foo"]);
  });
  it("tries TikTok first for a plain handle", () => {
    expect(storageKeyCandidates("@Foo")).toEqual(["foo", "ig_foo", "yt_foo"]);
  });
});
