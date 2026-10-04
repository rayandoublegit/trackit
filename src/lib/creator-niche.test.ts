import { describe, expect, it } from "vitest";
import { classifyCreatorNiche } from "@/lib/creator-niche";

describe("classifyCreatorNiche", () => {
  it("finds the niche the videos are about", () => {
    const v = classifyCreatorNiche({
      bio: "Recettes faciles 🍝",
      captions: ["Ma recette de pâtes en 10 min #recette #cuisine", "Le gâteau au chocolat le plus simple #patisserie", "Batch cooking de la semaine #mealprep"],
    });
    expect(v.primaryNiche).toBe("food");
    expect(v.confident).toBe(true);
  });

  it("does not tag a niche from one passing word", () => {
    const v = classifyCreatorNiche({ bio: "J'adore la food", captions: ["Storytime de ma journée", "On parle de tout et de rien"] });
    expect(v.primaryNiche).toBeNull();
  });

  it("keeps a close second niche", () => {
    const v = classifyCreatorNiche({
      captions: ["Séance muscu jambes #gym #musculation", "Mon repas protéiné après l'entraînement #recette #mealprep", "Workout du jour #fitness", "Recette healthy #food", "Abdos en 5 minutes #abs #workout", "Séance cardio #gymtok"],
    });
    expect(v.primaryNiche).toBe("fitness");
    expect(v.niches).toContain("food");
  });

  it("ignores generic hashtags", () => {
    expect(classifyCreatorNiche({ captions: ["#fyp #viral #pourtoi", "#foryou"] }).primaryNiche).toBeNull();
  });

  it("matches whole words only", () => {
    // "startup" contains "art", "cartoon" contains "car": neither counts.
    const v = classifyCreatorNiche({ captions: ["startup cartoon", "startup cartoon"] });
    expect(v.scores.art ?? 0).toBe(0);
    expect(v.scores.auto ?? 0).toBe(0);
  });
});
