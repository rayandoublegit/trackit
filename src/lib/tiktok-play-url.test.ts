import { describe, it, expect } from "vitest";
import { extractTikTokPlayUrl } from "./tiktok-play-url";

describe("extractTikTokPlayUrl", () => {
  it("reads play_addr url_list first", () => {
    expect(
      extractTikTokPlayUrl({
        play_addr: { url_list: ["https://v16-webapp.tiktok.com/video/1.mp4"] },
      })
    ).toBe("https://v16-webapp.tiktok.com/video/1.mp4");
  });

  it("falls back to bit_rate play_addr", () => {
    expect(
      extractTikTokPlayUrl({
        bit_rate: [{ play_addr: { url_list: ["https://v16-webapp.tiktok.com/video/2.mp4"] } }],
      })
    ).toBe("https://v16-webapp.tiktok.com/video/2.mp4");
  });
});
