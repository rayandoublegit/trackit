import { describe, expect, it } from "vitest";
import {
  buildFactLines,
  buildFirstEmailPrompt,
  buildFollowUpPrompt,
  fallbackFollowUp,
  findUnsupportedNumbers,
  formatCompact,
  numberSourcesFor,
  parseEmailJson,
  resolveEmailLanguage,
  type CreatorFacts,
} from "./outreach-sequences-prompt";

const mia: CreatorFacts = {
  username: "mia.glow",
  platform: "tiktok",
  displayName: "Mia Laurent",
  niche: "skincare",
  followers: 128_400,
  avgViews: 41_000,
  engagementRate: 6.27,
  recentVideoCaption: "My 5-step night routine for dry skin",
  country: "France",
  language: "fr",
};

describe("fact lines", () => {
  it("lists only known facts, numbers pre-formatted", () => {
    const lines = buildFactLines(mia, "en");
    expect(lines).toContain("Followers: 128.4K");
    expect(lines).toContain("Average views per video: 41K");
    expect(lines).toContain("Engagement rate: 6.3%");
    expect(lines.some((l) => l.startsWith("Recent video caption:"))).toBe(true);
  });

  it("omits unknown or zero values instead of inventing them", () => {
    const lines = buildFactLines({ username: "ig_kai", platform: "instagram", followers: 0, engagementRate: null }, "en");
    expect(lines).toEqual(["Handle: @kai on instagram"]);
  });

  it("formats French numbers", () => {
    expect(formatCompact(128_400, "fr")).toBe("128,4 k");
    expect(formatCompact(2_000_000, "fr")).toBe("2 m");
    expect(buildFactLines(mia, "fr")).toContain("Engagement rate: 6,3 %");
  });
});

describe("prompts", () => {
  it("first email: real facts + pitch, explicit number rule, creator's language", () => {
    const lang = resolveEmailLanguage(mia.language, "en");
    expect(lang).toEqual({ code: "fr", name: "French", optOutLang: "fr" });
    const p = buildFirstEmailPrompt({ facts: mia, brandPitch: "Lune skincare, 20% commission", tone: "friendly", languageName: lang.name, lang: lang.code });
    expect(p.system).toContain("Write in French");
    expect(p.system).toMatch(/Never invent/);
    expect(p.system).toMatch(/number only if it appears exactly/);
    expect(p.user).toContain("Followers: 128,4 k");
    expect(p.user).toContain("Lune skincare, 20% commission");
    expect(p.user).not.toMatch(/undefined|null|NaN/);
  });

  it("falls back to the sequence language when the creator's is unknown", () => {
    expect(resolveEmailLanguage(null, "fr").name).toBe("French");
    expect(resolveEmailLanguage("xx", "en").name).toBe("English");
    expect(resolveEmailLanguage("es", "fr")).toEqual({ code: "es", name: "Spanish", optOutLang: "en" });
  });

  it("follow-ups are short, reference the first email and say when it is the last one", () => {
    const base = { facts: mia, brandPitch: "Lune", tone: "casual" as const, languageName: "English", lang: "en", firstSubject: "Your night routine", firstBody: "Hi Mia…" };
    const p1 = buildFollowUpPrompt({ ...base, followUpNumber: 1 });
    expect(p1.system).toMatch(/25 to 70 words/);
    expect(p1.user).toContain('FIRST EMAIL (already sent, subject "Your night routine")');
    expect(p1.system).not.toMatch(/last follow-up/);
    expect(buildFollowUpPrompt({ ...base, followUpNumber: 3 }).system).toMatch(/last follow-up/);
  });

  it("parses the JSON answer, with or without fences", () => {
    expect(parseEmailJson('{"subject":"Hi","body":"Hello"}')).toEqual({ subject: "Hi", body: "Hello" });
    expect(parseEmailJson('```json\n{"body":"Hello"}\n```')).toEqual({ subject: undefined, body: "Hello" });
    expect(parseEmailJson("not json")).toBeNull();
    expect(parseEmailJson('{"subject":"x"}')).toBeNull();
  });
});

describe("number guard (never invent numbers)", () => {
  const sources = numberSourcesFor(mia, "Free product + 20% commission on every sale", "en");

  it("accepts numbers that come from the facts or the pitch", () => {
    expect(findUnsupportedNumbers("Your 128.4K followers and 6.3% engagement — plus 20% commission.", sources)).toEqual([]);
    expect(findUnsupportedNumbers("Loved your 5-step night routine.", sources)).toEqual([]);
  });

  it("flags invented figures", () => {
    expect(findUnsupportedNumbers("Brands like us saw 3x sales and 250 orders in 2025.", sources)).toEqual(["3", "250", "2025"]);
    expect(findUnsupportedNumbers("We pay $500 per video.", sources)).toEqual(["500"]);
  });

  it("the template follow-up contains no number at all", () => {
    for (const n of [1, 2, 3]) {
      for (const lang of ["en", "fr"]) expect(fallbackFollowUp(n, lang, "Mia")).not.toMatch(/\d/);
    }
  });
});
