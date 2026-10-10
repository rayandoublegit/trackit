import { describe, expect, it } from "vitest";
import { decodeEntities, extractSiteInfo, parseShopifyProducts, siteBrief, visibleText } from "./mino-site-extract";

const SHOP = `<!doctype html>
<html lang="fr-fr">
<head>
  <title>Maison Lumi &ndash; Soins naturels</title>
  <meta name="description" content="Cosm&eacute;tiques bio fabriqu&eacute;s en France.">
  <meta property="og:site_name" content="Maison Lumi">
  <meta property="og:image" content="https://cdn.shopify.com/s/files/hero.jpg">
  <link rel="alternate" hreflang="fr-be" href="https://lumi.fr/be">
  <script src="https://cdn.shopify.com/s/theme.js"></script>
  <style>.x{color:red}</style>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sérum éclat","offers":{"@type":"Offer","price":"29.00","priceCurrency":"EUR"}}</script>
</head>
<body>
  <script>window.secret = "do not read";</script>
  <h1>Des soins qui respectent votre peau</h1>
  <p>Livraison offerte d&egrave;s 49&nbsp;€. <b>Ajouter au panier</b></p>
  <noscript>Activez JavaScript</noscript>
  <!-- hidden comment -->
</body>
</html>`;

describe("extractSiteInfo", () => {
  it("reads title, description, language, shop, products, currency and country", () => {
    const s = extractSiteInfo(SHOP, "https://www.lumi.fr/");
    expect(s.host).toBe("lumi.fr");
    expect(s.title).toBe("Maison Lumi – Soins naturels");
    expect(s.description).toBe("Cosmétiques bio fabriqués en France.");
    expect(s.siteName).toBe("Maison Lumi");
    expect(s.lang).toBe("fr-FR");
    expect(s.platform).toBe("shopify");
    expect(s.isShop).toBe(true);
    expect(s.products).toEqual([{ name: "Sérum éclat", price: "29.00", currency: "EUR" }]);
    expect(s.currencies).toContain("EUR");
    expect(s.countryHints).toEqual(expect.arrayContaining(["FR", "BE"]));
  });

  it("keeps visible text only (no scripts, styles, comments, noscript)", () => {
    const s = extractSiteInfo(SHOP, "https://lumi.fr");
    expect(s.text).toContain("Des soins qui respectent votre peau");
    expect(s.text).toContain("Livraison offerte dès 49 €");
    expect(s.text).not.toContain("secret");
    expect(s.text).not.toContain("color:red");
    expect(s.text).not.toContain("hidden comment");
    expect(s.text).not.toContain("Activez JavaScript");
  });

  it("works on a bare page", () => {
    const s = extractSiteInfo("<p>Hello</p>", "https://example.com");
    expect(s).toMatchObject({ title: "", lang: "", isShop: false, platform: "other", products: [], text: "Hello" });
  });

  it("reads an Open Graph product page and a dollar price", () => {
    const html = `<html lang="en-US"><head><meta property="og:type" content="product"><meta property="og:title" content="Trail Shoe"><meta property="product:price:amount" content="120"><meta property="product:price:currency" content="USD"></head><body>Buy now $120</body></html>`;
    const s = extractSiteInfo(html, "https://shoes.com/p/1");
    expect(s.products).toEqual([{ name: "Trail Shoe", price: "120", currency: "USD" }]);
    expect(s.currencies).toEqual(["USD"]);
    expect(s.countryHints).toEqual(["US"]);
  });
});

describe("helpers", () => {
  it("decodes entities", () => {
    expect(decodeEntities("caf&eacute; &amp; th&#233; &#x2019;")).toBe("café & thé ’");
  });
  it("caps the visible text", () => {
    expect(visibleText(`<body>${"word ".repeat(5000)}</body>`, 100).length).toBeLessThanOrEqual(100);
  });
  it("parses Shopify products.json", () => {
    const products = parseShopifyProducts({ products: [{ title: "Bougie", variants: [{ price: "18.00" }] }, { title: "" }, { nope: 1 }] }, "EUR");
    expect(products).toEqual([{ name: "Bougie", price: "18.00", currency: "EUR" }]);
    expect(parseShopifyProducts(null)).toEqual([]);
  });
  it("builds a short labelled brief for the model", () => {
    const brief = siteBrief(extractSiteInfo(SHOP, "https://lumi.fr"));
    expect(brief).toContain("Title: Maison Lumi");
    expect(brief).toContain("Shop: yes (shopify)");
    expect(brief).toContain("Sérum éclat (29.00 EUR)");
    expect(brief).not.toContain("<");
  });
});
