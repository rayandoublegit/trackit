import { describe, expect, it } from "vitest";
import { mapImportRows, parseCsvText, parseFollowersCount } from "./parse-creator-import";

describe("parse-creator-import", () => {
  it("parses csv rows with username column", () => {
    const csv = "username,display_name,platform,followers\nmrbeast,MrBeast,tiktok,128900000";
    const rows = mapImportRows(parseCsvText(csv));
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("mrbeast");
    expect(rows[0].displayName).toBe("MrBeast");
    expect(rows[0].followers).toBe(128900000);
  });

  it("extracts username from profile url", () => {
    const rows = mapImportRows([
      { profile_url: "https://www.tiktok.com/@creator123", display_name: "Creator" },
    ]);
    expect(rows[0]?.username).toBe("creator123");
  });

  it("parses follower shorthand", () => {
    expect(parseFollowersCount("1.1M")).toBe(1_100_000);
    expect(parseFollowersCount("240.7k")).toBe(240_700);
  });
});
