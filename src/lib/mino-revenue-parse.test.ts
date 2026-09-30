import { describe, expect, it } from "vitest";
import { parseCreatorSearch } from "./mino-search-parse";
import { findBrandCreator } from "./mino-widgets";
import {
  describeRevenueAsk,
  looksLikeAction,
  parseCreatorMention,
  parsePeriodDays,
  parseRevenueAsk,
} from "./mino-revenue-parse";

describe("parseRevenueAsk", () => {
  it("reads French revenue asks with a creator and a period", () => {
    expect(parseRevenueAsk("combien j'ai généré avec @luna")).toEqual({
      range: "30d",
      days: 30,
      focus: "revenue",
      creator: "luna",
    });
    expect(parseRevenueAsk("Combien j’ai généré avec Luna cette semaine ?")).toEqual({
      range: "7d",
      days: 7,
      focus: "revenue",
      creator: "Luna",
    });
    expect(parseRevenueAsk("ventes des 30 derniers jours")).toEqual({ range: "30d", days: 30, focus: "revenue" });
    expect(parseRevenueAsk("Quel CA aujourd'hui ?")).toMatchObject({ range: "today", days: 1 });
    expect(parseRevenueAsk("combien de commandes ce trimestre")).toMatchObject({ range: "90d", focus: "revenue" });
  });

  it("reads English revenue asks", () => {
    expect(parseRevenueAsk("how much did I make this week")).toEqual({ range: "7d", days: 7, focus: "revenue" });
    expect(parseRevenueAsk("How much did we generate with @mia.glow over the last 3 days?")).toEqual({
      range: "3d",
      days: 3,
      focus: "revenue",
      creator: "mia.glow",
    });
    expect(parseRevenueAsk("revenue from Luna Beauty this month")).toMatchObject({ range: "30d", creator: "Luna Beauty" });
    expect(parseRevenueAsk("sales in the past two weeks")).toMatchObject({ range: "30d", days: 30 });
  });

  it("reads the Home and chat chips", () => {
    expect(parseRevenueAsk("How much did I make this week?")).toEqual({ range: "7d", days: 7, focus: "revenue" });
    expect(parseRevenueAsk("Combien j’ai généré cette semaine ?")).toEqual({ range: "7d", days: 7, focus: "revenue" });
  });

  it("reads top and new creators", () => {
    expect(parseRevenueAsk("top creators this month")).toEqual({ range: "30d", days: 30, focus: "top" });
    expect(parseRevenueAsk("mes meilleurs créateurs")).toMatchObject({ focus: "top" });
    expect(parseRevenueAsk("new creators")).toEqual({ range: "30d", days: 30, focus: "new" });
    expect(parseRevenueAsk("Nouveaux créateurs cette semaine")).toMatchObject({ focus: "new", range: "7d" });
    expect(parseRevenueAsk("who joined in the last 7 days")).toMatchObject({ focus: "new", range: "7d" });
  });

  it("leaves creator searches, actions and prices alone", () => {
    for (const text of [
      "Find micro fitness creators on TikTok",
      "Trouve des créatrices beauté sur Instagram en France",
      "Beauty creators in France with an email",
      "top beauty creators on TikTok",
      "Find creators who drive sales in skincare",
      "Pay @luna her commissions",
      "Payer un créateur",
      "Crée une nouvelle campagne",
      "Open analytics",
      "How much does the Pro plan cost?",
      "combien coûte l'abonnement",
      "Hello Mino",
    ]) {
      expect(parseRevenueAsk(text), text).toBeNull();
    }
  });

  it("does not steal the creator searches Mino already runs", () => {
    expect(parseRevenueAsk("Find skincare creators with an email")).toBeNull();
    expect(parseCreatorSearch("Find skincare creators with an email")).not.toBeNull();
  });
});

describe("findBrandCreator", () => {
  const rows = [
    { id: "1", handle: "@luna.glow", full_name: "Luna Martin" },
    { id: "2", handle: "maxfit", full_name: "Max Éloi" },
  ];
  it("matches handles and names, exact first", () => {
    expect(findBrandCreator(rows, "luna.glow")?.id).toBe("1");
    expect(findBrandCreator(rows, "Luna")?.id).toBe("1");
    expect(findBrandCreator(rows, "max eloi")?.id).toBe("2");
    expect(findBrandCreator(rows, "nobody")).toBeNull();
  });
});

describe("looksLikeAction", () => {
  it("sends verbs Mino executes to its actions", () => {
    expect(looksLikeAction("Pay a creator")).toBe(true);
    expect(looksLikeAction("Ouvre les paiements")).toBe(true);
    expect(looksLikeAction("go to campaigns")).toBe(true);
    expect(looksLikeAction("what is a good commission rate?")).toBe(false);
  });
});

describe("period and creator helpers", () => {
  it("snaps periods from numbers and words", () => {
    expect(parsePeriodDays("last 14 days")).toBe(14);
    expect(parsePeriodDays("les 3 derniers mois")).toBe(90);
    expect(parsePeriodDays("trente derniers jours")).toBe(30);
    expect(parsePeriodDays("hier")).toBe(3);
    expect(parsePeriodDays("ce mois-ci")).toBe(30);
    expect(parsePeriodDays("sales")).toBeNull();
  });

  it("finds the creator after with / avec and stops at the period", () => {
    expect(parseCreatorMention("avec luna_beauty depuis 7 jours")).toBe("luna_beauty");
    expect(parseCreatorMention("with my creators")).toBeUndefined();
    expect(parseCreatorMention("pour la campagne été")).toBeUndefined();
  });

  it("describes the ask in one line", () => {
    expect(describeRevenueAsk({ range: "7d", days: 7, focus: "revenue", creator: "luna" }, "fr")).toBe("7 derniers jours · @luna");
    expect(describeRevenueAsk({ range: "today", days: 1, focus: "top" })).toBe("Today");
  });
});
