import { EN_NICHE_QUERIES, FR_NICHE_QUERIES, NICHE_TREE } from "@/lib/niche-tree";

// Niche of a creator from what they actually post: hashtags and words of the
// latest captions, plus the bio. Whole words only, hashtags weigh more, and a
// niche is only kept when it clearly leads, so a creator found through the
// search "gym workout" is not tagged fitness unless the videos say so.

// Core single words per niche (FR + EN), on top of the niche tree's sub-niches
// and search queries.
const CORE_WORDS: Record<string, string[]> = {
  fitness: ["gym", "workout", "muscu", "musculation", "fitness", "sport", "coach", "abs", "cardio", "training", "entrainement", "seance", "squat"],
  food: ["recette", "recettes", "recipe", "recipes", "cuisine", "cooking", "food", "foodie", "chef", "repas", "dinner", "lunch", "gateau", "cake", "patisserie", "restaurant", "miam"],
  beauty: ["makeup", "maquillage", "skincare", "beaute", "beauty", "cheveux", "hair", "ongles", "nails", "parfum", "perfume", "soin", "serum", "mascara", "lipstick", "rouge"],
  fashion: ["outfit", "outfits", "tenue", "mode", "fashion", "style", "look", "ootd", "haul", "vinted", "shein", "zara", "dressing", "sneakers"],
  travel: ["voyage", "travel", "vacances", "trip", "roadtrip", "destination", "hotel", "plage", "beach", "vanlife", "backpacking"],
  pets: ["chien", "chiens", "chat", "chats", "dog", "dogs", "cat", "cats", "chiot", "puppy", "kitten", "animaux", "pets"],
  gaming: ["gaming", "gamer", "jeu", "jeux", "game", "games", "fortnite", "minecraft", "valorant", "twitch", "stream", "playstation", "xbox", "nintendo", "fifa", "gta"],
  lifestyle: ["vlog", "routine", "dayinmylife", "lifestyle", "quotidien", "motivation", "productivite", "productivity", "organisation"],
  finance: ["argent", "money", "bourse", "invest", "investir", "investissement", "crypto", "bitcoin", "trading", "finance", "budget", "epargne", "immobilier"],
  tech: ["tech", "iphone", "android", "smartphone", "gadget", "gadgets", "ia", "ai", "chatgpt", "setup", "pc", "apple", "samsung", "coding", "code"],
  home: ["deco", "decoration", "maison", "home", "interior", "menage", "cleaning", "rangement", "diy", "renovation", "appartement"],
  parenting: ["maman", "papa", "bebe", "baby", "enfant", "enfants", "kids", "mom", "mum", "dad", "grossesse", "pregnancy", "parent", "parents"],
  wellness: ["yoga", "meditation", "bienetre", "wellness", "mentalhealth", "anxiete", "anxiety", "therapie", "therapy", "sommeil", "sleep", "nutrition"],
  business: ["business", "entrepreneur", "entreprise", "marketing", "startup", "freelance", "client", "clients", "agence", "vente", "ventes"],
  "e-commerce": ["ecommerce", "ecom", "dropshipping", "shopify", "amazonfba", "tiktokshop"],
  saas: ["saas", "nocode", "indiehacker", "buildinpublic"],
  outdoors: ["randonnee", "hiking", "camping", "peche", "fishing", "escalade", "climbing", "surf", "ski", "velo", "cycling"],
  auto: ["voiture", "voitures", "car", "cars", "auto", "moto", "motos", "motorcycle", "supercar", "tuning"],
  art: ["art", "dessin", "drawing", "painting", "peinture", "tattoo", "tatouage", "photographie", "photography", "artiste", "artist", "illustration"],
};

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

type Vocab = { words: Set<string>; phrases: string[]; tags: Set<string> };

const VOCAB: Record<string, Vocab> = Object.fromEntries(
  Object.keys(NICHE_TREE).map((niche) => {
    const subs = (NICHE_TREE[niche] ?? []).map(strip);
    const queries = [...(FR_NICHE_QUERIES[niche] ?? []), ...(EN_NICHE_QUERIES[niche] ?? [])].map(strip);
    const words = new Set([strip(niche), ...(CORE_WORDS[niche] ?? []).map(strip), ...subs.filter((s) => !s.includes(" "))]);
    const phrases = [...queries, ...subs].filter((q) => q.includes(" "));
    // A hashtag is the niche, a sub-niche, a core word or a query without spaces.
    const tags = new Set([...words, ...queries.map((q) => q.replace(/\s+/g, "")), ...subs.map((s) => s.replace(/\s+/g, ""))]);
    return [niche, { words, phrases, tags }];
  }),
);

export type NicheVerdict = { primaryNiche: string | null; niches: string[]; confident: boolean; scores: Record<string, number> };

/** Scores every niche on the creator's own words and hashtags. */
export function classifyCreatorNiche(input: { bio?: string | null; captions?: string[]; hashtags?: string[] }): NicheVerdict {
  const text = strip([input.bio ?? "", ...(input.captions ?? [])].join(" \n "));
  const words = text.replace(/#[\p{L}\p{N}_]+/gu, " ").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  const hashtags = [
    ...(input.hashtags ?? []).map((h) => strip(h).replace(/^#/, "")),
    ...[...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]),
  ].filter((h) => h && !["fyp", "foryou", "pourtoi", "viral", "fy", "foryoupage", "tiktok", "trend", "xyzbca"].includes(h));
  const padded = ` ${words.join(" ")} `;

  const scores: Record<string, number> = {};
  for (const [niche, v] of Object.entries(VOCAB)) {
    let s = 0;
    for (const w of words) if (v.words.has(w)) s += 1;
    for (const h of hashtags) if (v.tags.has(h)) s += 2;
    for (const p of v.phrases) if (padded.includes(` ${p} `)) s += 2;
    if (s > 0) scores[niche] = s;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best) return { primaryNiche: null, niches: [], confident: false, scores };
  // Clear lead: at least 4 points and well ahead of the runner-up.
  const confident = best[1] >= 4 && (!second || best[1] >= second[1] * 1.5);
  const niches = [best[0]];
  if (second && second[1] >= 4 && second[1] >= best[1] * 0.5) niches.push(second[0]);
  return { primaryNiche: confident ? best[0] : null, niches: confident ? niches : [], confident, scores };
}
