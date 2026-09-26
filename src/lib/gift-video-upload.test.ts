import { describe, expect, it } from "vitest";
import { giftResumableEndpoint } from "./gift-video-upload";

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
