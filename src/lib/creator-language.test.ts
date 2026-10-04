import { describe, expect, it } from "vitest";
import { creatorCountry, creatorLanguage, detectTextLanguage } from "@/lib/creator-language";

describe("detectTextLanguage", () => {
  it("reads French and English", () => {
    expect(detectTextLanguage("Ma routine du matin pour avoir une peau qui brille, c'est trop simple et ça marche")?.lang).toBe("fr");
    expect(detectTextLanguage("This is my morning routine and it is the best thing you can do for your skin")?.lang).toBe("en");
  });
  it("gives up on short or mixed text", () => {
    expect(detectTextLanguage("#fyp #viral")).toBeNull();
    expect(detectTextLanguage("ok")).toBeNull();
  });
});

describe("creatorLanguage", () => {
  it("trusts the languages TikTok detected on the videos", () => {
    expect(creatorLanguage({ videoLanguages: ["en", "en", "fr", "en"], bio: "Paris 🇫🇷 je suis là" })).toBe("en");
    expect(creatorLanguage({ videoLanguages: ["fr", "fr", "un"] })).toBe("fr");
  });
  it("keeps other languages as such instead of guessing French", () => {
    expect(creatorLanguage({ videoLanguages: ["ar", "ar", "ar"] })).toBe("ar");
  });
  it("falls back to the captions", () => {
    expect(
      creatorLanguage({
        captions: ["Je vous montre ma recette préférée pour le dîner", "On teste les nouveaux produits avec vous, c'est parti", "Le meilleur look de la semaine pour toi"],
      }),
    ).toBe("fr");
  });
  it("returns null when nothing says", () => {
    expect(creatorLanguage({ captions: ["#fyp"], bio: "" })).toBeNull();
  });
});

describe("creatorCountry", () => {
  it("uses the account region", () => {
    expect(creatorCountry({ regions: ["FR", "FR", "BE"] })).toBe("FR");
    expect(creatorCountry({ profileRegion: "us", regions: ["FR"] })).toBe("US");
    expect(creatorCountry({ regions: [] })).toBeNull();
  });
});
