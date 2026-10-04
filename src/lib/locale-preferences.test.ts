import { describe, expect, it } from "vitest";
import { isAppPath, langToRemember } from "@/lib/locale-preferences";

describe("langToRemember", () => {
  it("keeps a French choice when an English public page is shown (sign-in, pricing)", () => {
    expect(langToRemember("/pricing", "en", "fr")).toBeNull();
    expect(langToRemember("/", "en", "fr")).toBeNull();
  });

  it("remembers French from any /fr page", () => {
    expect(langToRemember("/fr/pricing", "fr", "en")).toBe("fr");
    expect(langToRemember("/fr", "fr", null)).toBe("fr");
    expect(langToRemember("/fr/pricing", "fr", "fr")).toBeNull();
  });

  it("defaults to English on a first English visit", () => {
    expect(langToRemember("/pricing", "en", null)).toBe("en");
  });

  it("never rewrites the choice from an app page", () => {
    expect(langToRemember("/dashboard", "fr", "fr")).toBeNull();
    expect(langToRemember("/auth", "fr", "fr")).toBeNull();
  });

  it("honours an explicit switch link", () => {
    expect(langToRemember("/blog", "en", "fr", "en")).toBe("en");
  });
});

describe("isAppPath", () => {
  it("treats the sign-in page as part of the app", () => {
    expect(isAppPath("/auth")).toBe(true);
    expect(isAppPath("/auth/confirm")).toBe(true);
    expect(isAppPath("/authors")).toBe(false);
    expect(isAppPath("/fr/dashboard")).toBe(true);
  });
});
