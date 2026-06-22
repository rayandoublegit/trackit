import { describe, it, expect } from "vitest";
import { PIPELINE_STAGES, STAGE_KEYS, stageLabel, stageColor, isValidStage } from "@/lib/pipeline";

describe("pipeline stages", () => {
  it("is ordered saved -> contacted -> in_progress -> nurturing -> signed -> lost", () => {
    expect(STAGE_KEYS).toEqual(["saved", "contacted", "in_progress", "nurturing", "signed", "lost"]);
  });
  it("has a French label and a color for every stage", () => {
    for (const s of PIPELINE_STAGES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.color).toMatch(/^#/);
      expect(s.bg).toMatch(/^#/);
    }
  });
  it("looks up labels and colors", () => {
    expect(stageLabel("signed")).toBe("Signé");
    expect(stageLabel("contacted")).toBe("Contacté");
    expect(stageColor("contacted").bg).toBe("#E6F1FB");
  });
  it("falls back gracefully for unknown keys", () => {
    expect(stageLabel("???")).toBe("???");
    expect(stageColor("???")).toEqual({ color: "#5F5E5A", bg: "#F1EFE8" });
  });
  it("validates stage keys", () => {
    expect(isValidStage("nurturing")).toBe(true);
    expect(isValidStage("bogus")).toBe(false);
  });
});
