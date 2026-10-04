// Tells brand / company accounts apart from content creators in the catalog.
// Discovery hides them by default. Deliberately conservative: a creator who
// "shops their looks" or works with brands must stay visible, so one weak hint
// is never enough; it takes a strong signal or two independent hints.

export type BrandSignals = {
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  bioLink?: string | null;
  /** TikTok Shop seller account (provider flag). */
  seller?: boolean | null;
  /** Instagram business category ("Clothing (Brand)", "Digital creator"…). */
  category?: string | null;
};

export type BrandVerdict = { isBrand: boolean; reason: string | null };

const STRONG_CATEGORY =
  /\b(brand|product\/service|shopping (?:&|and) retail|retail company|clothing store|e-?commerce|cosmetics store|beauty store|jewelry\/watches|company|business service|restaurant|hotel|grocery store|furniture store|supermarket|marque|entreprise|magasin)\b/i;
const CREATOR_CATEGORY = /\b(creator|blogger|personal blog|public figure|artist|athlete|musician|influencer|video creator|gamer|comedian|actor|cr[ée]at(?:eur|rice)|personnalit[ée])\b/i;

/** Legal forms and trademark marks in the name: SAS, SARL, Ltd, Inc, GmbH, ®, ™… */
const LEGAL_NAME = /(®|™|\b(?:sas|sasu|sarl|eurl|ltd|llc|inc|gmbh|plc|corp|s\.a\.s?|b\.v\.)\.?(?=\s|$))/i;
/** Handle ending like a storefront: "glowskin.shop", "nikeofficial", "maison_store". */
const SHOP_HANDLE = /(?:^|[._-]|[a-z])(shop|store|boutique|eshop|official|officiel|officielle|brand|cosmetics|skincare|apparel|clothing|wear|studio|paris_?shop)$/i;
const OFFICIAL_NAME = /\b(official|officiel|officielle|offizielle?)\b/i;

const COMMERCE_BIO: RegExp[] = [
  /free (?:worldwide )?shipping|worldwide shipping|ships? worldwide/i,
  /livraison (?:offerte|gratuite|express|rapide|partout)|exp[ée]di[ée] (?:sous|en) \d/i,
  /\b(?:shop|order|buy) now\b|commandez|commande(?:z)? (?:ici|en ligne|maintenant)|achetez/i,
  /boutique (?:en ligne|officielle)|online (?:store|shop)|e-?shop\b|notre (?:boutique|magasin|collection)|our (?:store|shop|collection|products)/i,
  /service client|customer (?:service|support|care)|\bsav\b/i,
  /\b(?:founded|est\.?|since) (?:in )?(?:19|20)\d{2}\b|fond[ée]e? en (?:19|20)\d{2}|depuis (?:19|20)\d{2}/i,
  /compte officiel|official (?:account|page)/i,
  /[🛒🛍️📦🚚]/u,
];
const SHOP_LINK = /(myshopify\.com|\.shop\b|\/shop\b|\/store\b|\/collections\/|\/products\/|amazon\.[a-z.]+\/(?:stores|shops))/i;
/** First-person or creator wording: a person behind the account. */
const CREATOR_BIO = /\b(?:ugc|cr[ée]at(?:eur|rice)|creator|influenc|blogueuse|blogger|youtubeuse?|streamer|je suis|j['’]ai|i['’]m|i am|my life|ma vie|collab|partenariat|contact pro|pro\s?:|management|agence|agency)\b/i;

export function detectBrand(s: BrandSignals): BrandVerdict {
  const name = (s.displayName || "").trim();
  const handle = (s.username || "").trim().toLowerCase().replace(/^@/, "").replace(/^(ig_|yt_)/, "");
  const bio = (s.bio || "").trim();
  const category = (s.category || "").trim();

  if (s.seller === true) return { isBrand: true, reason: "tiktok_seller" };
  if (category && STRONG_CATEGORY.test(category) && !CREATOR_CATEGORY.test(category)) {
    return { isBrand: true, reason: "category" };
  }
  if (LEGAL_NAME.test(name)) return { isBrand: true, reason: "legal_name" };

  const hints: string[] = [];
  if (SHOP_HANDLE.test(handle)) hints.push("shop_handle");
  if (OFFICIAL_NAME.test(name) || /(official|officiel)/.test(handle)) hints.push("official");
  const commerce = COMMERCE_BIO.filter((re) => re.test(bio)).length;
  if (commerce >= 1) hints.push("commerce_bio");
  if (commerce >= 2) hints.push("commerce_bio_2");
  if (s.bioLink && SHOP_LINK.test(s.bioLink)) hints.push("shop_link");

  // A person behind the account outweighs one storefront hint.
  const needed = CREATOR_BIO.test(bio) || (category && CREATOR_CATEGORY.test(category)) ? 3 : 2;
  const unique = new Set(hints.map((h) => (h === "official" && hints.includes("shop_handle") ? "shop_handle" : h)));
  return unique.size >= needed ? { isBrand: true, reason: [...unique].join("+") } : { isBrand: false, reason: null };
}
