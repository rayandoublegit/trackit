import { describe, expect, it } from "vitest";
import { detectBrand } from "@/lib/brand-detect";

describe("detectBrand: brands", () => {
  it("flags TikTok Shop sellers", () => {
    expect(detectBrand({ username: "anna", seller: true }).isBrand).toBe(true);
  });
  it("flags Instagram brand categories", () => {
    expect(detectBrand({ username: "x", category: "Clothing (Brand)" }).isBrand).toBe(true);
    expect(detectBrand({ username: "x", category: "Product/service" }).isBrand).toBe(true);
  });
  it("flags legal names and trademarks", () => {
    expect(detectBrand({ displayName: "Maison Lune SAS" }).isBrand).toBe(true);
    expect(detectBrand({ displayName: "GlowSkin®" }).isBrand).toBe(true);
  });
  it("flags a storefront handle with a commerce bio", () => {
    expect(detectBrand({ username: "glowskin.shop", bio: "Livraison offerte dès 49€ 🚚" }).isBrand).toBe(true);
  });
  it("flags a shop bio with two commerce hints", () => {
    expect(detectBrand({ username: "lunaparis", bio: "Boutique en ligne · Livraison gratuite · Service client 7j/7" }).isBrand).toBe(true);
  });
  it("flags an official handle with a shop link", () => {
    expect(detectBrand({ username: "nikeofficial", bioLink: "https://nike.com/collections/new" }).isBrand).toBe(true);
  });
});

describe("detectBrand: creators stay visible", () => {
  it("keeps a creator who shares her looks", () => {
    expect(detectBrand({ username: "lea.style", bio: "Mode & beauté ✨ shop my looks ⬇️ contact pro: lea@mail.com" }).isBrand).toBe(false);
  });
  it("keeps a creator with a single storefront hint", () => {
    expect(detectBrand({ username: "tomcooks", bio: "Order now my cookbook!" }).isBrand).toBe(false);
  });
  it("keeps a UGC creator even with shop words", () => {
    expect(detectBrand({ username: "sarah_ugc", bio: "UGC creator · free shipping hauls · collab: dm", bioLink: "https://beacons.ai/sarah" }).isBrand).toBe(false);
  });
  it("keeps creator categories", () => {
    expect(detectBrand({ username: "x", category: "Digital creator" }).isBrand).toBe(false);
  });
  it("keeps a plain profile", () => {
    expect(detectBrand({ username: "squeezie", displayName: "Squeezie", bio: "" }).isBrand).toBe(false);
  });
});
