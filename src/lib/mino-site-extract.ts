// Reads what a brand's web page says about it: title, description, Open Graph
// tags, visible text, language, currency and country hints, and products when
// it is a shop. Pure (no network), so it is tested on fixtures.

export type SiteProduct = { name: string; price?: string; currency?: string };

export type SiteInfo = {
  url: string;
  host: string;
  title: string;
  description: string;
  siteName: string;
  ogImage: string;
  /** html lang, e.g. "fr" or "en-GB" (lower-case language, upper-case region). */
  lang: string;
  /** Visible text, scripts and styles removed, at most ~6000 characters. */
  text: string;
  currencies: string[];
  /** ISO 3166-1 alpha-2 hints from the domain, the lang region and hreflang links. */
  countryHints: string[];
  isShop: boolean;
  platform: "shopify" | "woocommerce" | "wix" | "squarespace" | "other";
  products: SiteProduct[];
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  icirc: "î",
  iuml: "ï",
  euml: "ë",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  euro: "€",
  pound: "£",
  copy: "©",
  reg: "®",
  trade: "™",
  laquo: "«",
  raquo: "»",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

const clean = (s: string, max = 300) => decodeEntities(s).replace(/\s+/g, " ").trim().slice(0, max);

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
}

/** <meta name|property="key" content="..."> */
function meta(html: string, key: string): string {
  const re = /<meta\b[^>]*>/gi;
  for (const m of html.matchAll(re)) {
    const tag = m[0];
    const k = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop")).toLowerCase();
    if (k === key) return clean(attr(tag, "content"));
  }
  return "";
}

/** Visible text of the page: scripts, styles, svg, comments and tags removed. */
export function visibleText(html: string, max = 6000): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const text = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr)\b[^>]*>/gi, " . ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/\s+/g, " ")
    .replace(/(\s\.\s*){2,}/g, " . ")
    .replace(/^[\s.]+/, "")
    .replace(/(\s+\.)+\s*$/, "")
    .trim()
    .slice(0, max);
}

const TLD_COUNTRY: Record<string, string> = {
  fr: "FR",
  be: "BE",
  ch: "CH",
  ca: "CA",
  uk: "GB",
  de: "DE",
  at: "AT",
  es: "ES",
  it: "IT",
  pt: "PT",
  br: "BR",
  nl: "NL",
  us: "US",
  au: "AU",
  ie: "IE",
  lu: "LU",
  ma: "MA",
  mx: "MX",
};

const CURRENCY_SIGNS: [RegExp, string][] = [
  [/€|\bEUR\b/, "EUR"],
  [/£|\bGBP\b/, "GBP"],
  [/\bCHF\b/, "CHF"],
  [/\bCAD\b|CA\$/, "CAD"],
  [/\bUSD\b|US\$/, "USD"],
  [/R\$|\bBRL\b/, "BRL"],
];

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs.filter(Boolean))];
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // malformed JSON-LD is common: skip it
    }
  }
  return out;
}

function collectProducts(node: unknown, out: SiteProduct[], depth = 0) {
  if (!node || depth > 6 || out.length >= 20) return;
  if (Array.isArray(node)) {
    for (const n of node) collectProducts(n, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => t === "Product") && typeof o.name === "string") {
    const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
    const price = offers?.price ?? offers?.lowPrice;
    out.push({
      name: clean(o.name, 120),
      price: price != null ? String(price) : undefined,
      currency: typeof offers?.priceCurrency === "string" ? offers.priceCurrency.toUpperCase() : undefined,
    });
  }
  for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasVariant"]) {
    if (o[key]) collectProducts(o[key], out, depth + 1);
  }
}

/** Reads a Shopify /products.json payload into product names and prices. */
export function parseShopifyProducts(payload: unknown, currency?: string): SiteProduct[] {
  const list = (payload as { products?: unknown })?.products;
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 20)
    .map((p) => {
      const o = p as { title?: unknown; variants?: { price?: unknown }[]; product_type?: unknown };
      const title = typeof o.title === "string" ? clean(o.title, 120) : "";
      const price = o.variants?.[0]?.price;
      return title ? { name: title, price: price != null ? String(price) : undefined, currency } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null) as SiteProduct[];
}

export function extractSiteInfo(html: string, pageUrl: string): SiteInfo {
  const url = new URL(pageUrl);
  const host = url.hostname.replace(/^www\./, "");
  const head = html.slice(0, 200_000);
  const titleTag = clean(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 200);
  const htmlTag = head.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const rawLang = attr(htmlTag, "lang") || meta(head, "og:locale").replace("_", "-");
  const [l, r] = rawLang.split(/[-_]/);
  const lang = l ? `${l.toLowerCase()}${r ? `-${r.toUpperCase()}` : ""}` : "";

  const text = visibleText(html);
  const lowered = html.slice(0, 400_000);
  const platform: SiteInfo["platform"] = /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(lowered)
    ? "shopify"
    : /woocommerce|wp-content\/plugins\/woocommerce/i.test(lowered)
      ? "woocommerce"
      : /static\.wixstatic\.com|wix\.com/i.test(lowered)
        ? "wix"
        : /squarespace\.com|static1\.squarespace/i.test(lowered)
          ? "squarespace"
          : "other";

  const products: SiteProduct[] = [];
  for (const block of jsonLdBlocks(html)) collectProducts(block, products);
  const ogType = meta(head, "og:type");
  const ogPriceCurrency = meta(head, "og:price:currency") || meta(head, "product:price:currency");
  if (!products.length && /product/i.test(ogType)) {
    const name = meta(head, "og:title") || titleTag;
    const price = meta(head, "og:price:amount") || meta(head, "product:price:amount");
    if (name) products.push({ name, price: price || undefined, currency: ogPriceCurrency.toUpperCase() || undefined });
  }

  const priceText = `${text} ${ogPriceCurrency} ${products.map((p) => p.currency ?? "").join(" ")}`;
  const ldCurrencies = [...lowered.matchAll(/"priceCurrency"\s*:\s*"([A-Z]{3})"/g)].map((m) => m[1]);
  const currencies = uniq([
    ...ldCurrencies,
    ...(ogPriceCurrency ? [ogPriceCurrency.toUpperCase()] : []),
    ...CURRENCY_SIGNS.filter(([re]) => re.test(priceText)).map(([, c]) => c),
    // A bare "$" only counts when nothing more precise was found.
  ]);
  if (!currencies.length && /\$\s?\d|\d\s?\$/.test(text)) currencies.push("USD");

  const tld = host.split(".").pop() ?? "";
  const hreflangs = [...head.matchAll(/<link\b[^>]*hreflang\s*=\s*["']?([a-z]{2})[-_]([a-z]{2})/gi)].map((m) => m[2].toUpperCase());
  const countryHints = uniq([
    TLD_COUNTRY[tld] ?? "",
    r && /^[a-z]{2}$/i.test(r) ? r.toUpperCase() : "",
    ...hreflangs,
  ]).slice(0, 6);

  const isShop =
    platform === "shopify" ||
    platform === "woocommerce" ||
    products.length > 0 ||
    /add to cart|ajouter au panier|buy now|acheter|checkout|panier|\bcart\b|shop now/i.test(text);

  return {
    url: url.toString(),
    host,
    title: meta(head, "og:title") || titleTag,
    description: meta(head, "description") || meta(head, "og:description") || meta(head, "twitter:description"),
    siteName: meta(head, "og:site_name"),
    ogImage: meta(head, "og:image"),
    lang,
    text,
    currencies,
    countryHints,
    isShop,
    platform,
    products: products.slice(0, 20),
  };
}

/** What the model reads about the site: short, labelled, no HTML. */
export function siteBrief(s: SiteInfo): string {
  const lines = [
    `URL: ${s.url}`,
    s.siteName ? `Site name: ${s.siteName}` : "",
    s.title ? `Title: ${s.title}` : "",
    s.description ? `Description: ${s.description}` : "",
    s.lang ? `Page language: ${s.lang}` : "",
    s.currencies.length ? `Currencies seen: ${s.currencies.join(", ")}` : "",
    s.countryHints.length ? `Country hints: ${s.countryHints.join(", ")}` : "",
    `Shop: ${s.isShop ? `yes (${s.platform})` : "not detected"}`,
    s.products.length
      ? `Products: ${s.products
          .slice(0, 15)
          .map((p) => `${p.name}${p.price ? ` (${p.price}${p.currency ? ` ${p.currency}` : ""})` : ""}`)
          .join("; ")}`
      : "",
    s.text ? `Visible text (excerpt): ${s.text.slice(0, 4000)}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
