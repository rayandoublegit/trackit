import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt, parseAnalysis } from "@/lib/creator-content-analysis";

describe("buildAnalysisPrompt", () => {
  it("includes creator meta and asks for JSON only", () => {
    const p = buildAnalysisPrompt({ displayName: "Sarah Fit", niche: "fitness", followers: 85000 });
    expect(p).toContain("Sarah Fit");
    expect(p).toContain("fitness");
    expect(p).toContain("85000");
    expect(p).toMatch(/JSON/i);
  });
});

describe("parseAnalysis", () => {
  it("parses a clean JSON object", () => {
    const a = parseAnalysis(JSON.stringify({
      style: "talking-head face caméra", themes: ["nutrition", "musculation"],
      production: "soignée — bon cadrage", brandSafe: true,
      brandFit: "Marques de compléments et sportswear", summary: "Coach fitness qui partage des routines.",
    }));
    expect(a.style).toBe("talking-head face caméra");
    expect(a.themes).toEqual(["nutrition", "musculation"]);
    expect(a.brandSafe).toBe(true);
    expect(a.brandFit).toContain("compléments");
  });
  it("handles fenced JSON and caps themes", () => {
    const a = parseAnalysis("```json\n{\"style\":\"vlog\",\"themes\":[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\"],\"brandSafe\":false}\n```");
    expect(a.style).toBe("vlog");
    expect(a.themes).toHaveLength(5);
    expect(a.brandSafe).toBe(false);
  });
  it("defaults brandSafe to true and tolerates missing fields", () => {
    const a = parseAnalysis('{"style":"demo"}');
    expect(a.brandSafe).toBe(true);
    expect(a.themes).toEqual([]);
    expect(a.summary).toBe("");
  });
  it("throws on non-JSON", () => {
    expect(() => parseAnalysis("no json here")).toThrow();
  });
});
