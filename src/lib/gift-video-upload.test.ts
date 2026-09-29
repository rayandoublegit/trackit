import { describe, expect, it } from "vitest";
import { giftResumableEndpoint, giftUploadHeaders } from "./gift-video-upload";

describe("giftResumableEndpoint", () => {
  it("uses Supabase's direct storage hostname for large files", () => {
    expect(giftResumableEndpoint("https://abcxyz.supabase.co"))
      .toBe("https://abcxyz.storage.supabase.co/storage/v1/upload/resumable");
  });

  it("keeps self-hosted origins unchanged", () => {
    expect(giftResumableEndpoint("https://storage.example.test/"))
      .toBe("https://storage.example.test/storage/v1/upload/resumable");
  });
});

describe("giftUploadHeaders", () => {
  it("sends a legacy JWT public key as apikey and bearer", () => {
    const h = giftUploadHeaders("eyJhbGciOiJIUzI1NiJ9.x.y", "tok");
    expect(h).toEqual({ apikey: "eyJhbGciOiJIUzI1NiJ9.x.y", authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.x.y", "x-signature": "tok", "x-upsert": "false" });
  });

  it("sends a publishable key as apikey only", () => {
    const h = giftUploadHeaders("sb_publishable_abc", "tok");
    expect(h.apikey).toBe("sb_publishable_abc");
    expect(h.authorization).toBeUndefined();
    expect(h["x-signature"]).toBe("tok");
  });
});
