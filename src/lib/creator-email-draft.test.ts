import { describe, expect, it, vi } from "vitest";
import { buildTemplateEmailDraft, ensureSignature, generateCreatorEmailDraft, greetingName } from "./creator-email-draft";

const creator = {
  username: "@lea.makeup",
  displayName: "Léa Martin ✨",
  platform: "tiktok",
  niche: "beauty",
  followersCount: 245_000,
  engagementRate: 7.4,
};

describe("greetingName", () => {
  it("uses the first name, without emoji", () => {
    expect(greetingName(creator)).toBe("Léa");
  });
  it("falls back to the handle when the display name is the handle or empty", () => {
    expect(greetingName({ username: "@abc", displayName: "abc" })).toBe("abc");
    expect(greetingName({ username: "abc", displayName: "" })).toBe("abc");
  });
});

describe("buildTemplateEmailDraft", () => {
  it("personalises with real data (name, handle, platform, niche) and signs with the brand (EN)", () => {
    const d = buildTemplateEmailDraft({ creator, brandName: "Acme", lang: "en" });
    expect(d.source).toBe("template");
    expect(d.subject).toBe("Acme x Léa: partnership idea");
    expect(d.body).toContain("Hi Léa,");
    expect(d.body).toContain("your TikTok account (@lea.makeup)");
    expect(d.body).toContain("beauty content");
    expect(d.body.trim().endsWith("Best,\nAcme")).toBe(true);
  });

  it("French version uses vous and the French niche label", () => {
    const d = buildTemplateEmailDraft({ creator, brandName: "Acme", lang: "fr" });
    expect(d.subject).toBe("Acme x Léa : proposition de partenariat");
    expect(d.body).toContain("Bonjour Léa,");
    expect(d.body).toContain("votre compte TikTok (@lea.makeup)");
    expect(d.body).toContain("contenu beauté");
    expect(d.body).toContain("pourriez-vous");
    expect(d.body.trim().endsWith("Bien à vous,\nAcme")).toBe(true);
  });

  it("never states numbers (no invented or even real audience stats)", () => {
    for (const lang of ["en", "fr"] as const) {
      const d = buildTemplateEmailDraft({ creator, brandName: "Acme", lang });
      expect(`${d.subject}\n${d.body}`).not.toMatch(/\d/);
    }
  });

  it("works without brand or niche", () => {
    const d = buildTemplateEmailDraft({ creator: { username: "sam" }, brandName: "", lang: "en" });
    expect(d.subject).toBe("Partnership idea for @sam");
    expect(d.body).toContain("your account @sam,");
    expect(d.body).not.toContain("content,");
  });
});

describe("ensureSignature", () => {
  it("adds the brand once", () => {
    expect(ensureSignature("Hello", "Acme", "en")).toBe("Hello\n\nBest,\nAcme");
    expect(ensureSignature("Hello\n\nCheers,\nThe Acme team", "Acme", "en")).toBe("Hello\n\nCheers,\nThe Acme team");
  });
});

describe("generateCreatorEmailDraft", () => {
  it("uses the template when AI is not allowed (no request)", async () => {
    const fetchImpl = vi.fn();
    const d = await generateCreatorEmailDraft({ creator, brandName: "Acme", lang: "en", allowAI: false, fetchImpl });
    expect(d.source).toBe("template");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls /api/generate-outreach with platform Email, brand and language, then signs", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ subject: "A quick idea for your beauty videos", message: "Hi Léa,\n\nWe make clean lip products and would love to send you a few. Open to a paid collab?\n\n[Your name]" }), { status: 200 }),
    );
    const d = await generateCreatorEmailDraft({ creator, brandName: "Acme", lang: "fr", allowAI: true, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/generate-outreach");
    const sent = JSON.parse(String(init.body));
    expect(sent.platform).toBe("Email");
    expect(sent.brand).toBe("Acme");
    expect(sent.lang).toBe("fr");
    expect(sent.creator.username).toBe("lea.makeup");
    expect(d.source).toBe("ai");
    expect(d.subject).toBe("A quick idea for your beauty videos");
    expect(d.body).not.toContain("[Your name]");
    expect(d.body.trim().endsWith("Acme")).toBe(true);
  });

  it("falls back to the template when the AI route fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 }));
    const d = await generateCreatorEmailDraft({ creator, brandName: "Acme", lang: "en", allowAI: true, fetchImpl });
    expect(d.source).toBe("template");
  });
});
