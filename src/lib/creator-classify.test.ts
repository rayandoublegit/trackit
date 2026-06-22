import { describe, it, expect } from "vitest";
import { buildClassificationPrompt, parseClassification } from "@/lib/creator-classify";

describe("buildClassificationPrompt", () => {
  it("includes bio and captions", () => {
    const p = buildClassificationPrompt({ displayName: "Coach", bio: "fitness coach", captions: ["leg day", "protein"] });
    expect(p).toContain("fitness coach");
    expect(p).toContain("leg day");
    expect(p).toContain("JSON");
  });
});

describe("parseClassification", () => {
  it("parses clean JSON", () => {
    const out = parseClassification('{"primaryNiche":"fitness","niches":["fitness","calisthenics"],"language":"fr","countryCode":"FR","email":"a@b.com","brandSafe":true}');
    expect(out.primaryNiche).toBe("fitness");
    expect(out.niches).toContain("calisthenics");
    expect(out.language).toBe("fr");
    expect(out.countryCode).toBe("FR");
    expect(out.email).toBe("a@b.com");
    expect(out.brandSafe).toBe(true);
  });
  it("parses JSON inside code fences", () => {
    const out = parseClassification('```json\n{"primaryNiche":"food","niches":["food"],"language":"en","countryCode":null,"email":null,"brandSafe":true}\n```');
    expect(out.primaryNiche).toBe("food");
    expect(out.countryCode).toBeNull();
  });
  it("throws on malformed output", () => {
    expect(() => parseClassification("not json at all")).toThrow();
  });
});
