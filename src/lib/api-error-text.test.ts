import { describe, expect, it } from "vitest";
import { apiErrorText } from "@/lib/api-error-text";

const fallback = { en: "Something went wrong.", fr: "Une erreur est survenue." };

describe("apiErrorText", () => {
  it("never shows the English API error in French", () => {
    expect(apiErrorText({ error: "Missing title" }, "fr", fallback)).toBe(fallback.fr);
  });
  it("prefers the French twin when the API sends one", () => {
    expect(apiErrorText({ error: "Bad domain", errorFr: "Domaine invalide" }, "fr", fallback)).toBe("Domaine invalide");
  });
  it("shows the API error in English", () => {
    expect(apiErrorText({ error: "Missing title" }, "en", fallback)).toBe("Missing title");
  });
  it("falls back when the payload has no error", () => {
    expect(apiErrorText(null, "en", fallback)).toBe(fallback.en);
    expect(apiErrorText({}, "fr", fallback)).toBe(fallback.fr);
  });
});
