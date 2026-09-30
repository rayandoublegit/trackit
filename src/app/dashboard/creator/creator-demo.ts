// Local preview only (NEXT_PUBLIC_DEV_BYPASS_PLAN, never in a production build): fictional data so the
// creator app can be seen without a database. Never used in production.
// Three brands: commission + gifting, RPM, gifting only.

import type { Brand, Gifting, Rpm, Stats } from "./creator-data";

const LUMIERE = "b-lumiere";
const ATELIER = "b-atelier";
const OLIVE = "b-olive";

export function demoBrands(lang: "en" | "fr"): Brand[] {
  void lang;
  return [
    { brandId: LUMIERE, brandName: "Lumière Skin", logoUrl: "https://images.unsplash.com/photo-1576426863848-c21f53c60b19?w=96&h=96&fit=crop&auto=format&q=70", models: ["commission", "gifting"], commissionRate: 15, rpmRate: null, discountCode: "LUNA15", affiliateLink: "https://thentrack.it/l/luna" },
    { brandId: ATELIER, brandName: "Atelier Hair", logoUrl: "https://images.unsplash.com/photo-1623143445418-40c192fa3d11?w=96&h=96&fit=crop&auto=format&q=70", models: ["rpm"], commissionRate: null, rpmRate: 3, discountCode: null, affiliateLink: null },
    { brandId: OLIVE, brandName: "Maison Olive", logoUrl: "https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=96&h=96&fit=crop&auto=format&q=70", models: ["gifting"], commissionRate: null, rpmRate: null, discountCode: null, affiliateLink: null },
  ];
}

export function demoStats(): Stats {
  return {
    linked: true,
    balance: 184.5,
    totalEarned: 1239.6,
    totalCommissions: 1239.6,
    salesCount: 37,
    sales: [
      { id: "s1", orderAmount: 64, commissionAmount: 9.6, date: "2026-09-29T14:12:00Z", brandName: "Lumière Skin", brandId: LUMIERE },
      { id: "s2", orderAmount: 128, commissionAmount: 19.2, date: "2026-09-28T19:40:00Z", brandName: "Lumière Skin", brandId: LUMIERE },
      { id: "s3", orderAmount: 48, commissionAmount: 7.2, date: "2026-09-27T09:05:00Z", brandName: "Lumière Skin", brandId: LUMIERE },
      { id: "s4", orderAmount: 96, commissionAmount: 14.4, date: "2026-09-25T21:30:00Z", brandName: "Lumière Skin", brandId: LUMIERE },
    ],
    byBrand: [{ brandId: LUMIERE, brandName: "Lumière Skin", commissionRate: 15, totalSales: 8264, totalCommissions: 1239.6, balance: 184.5, totalEarned: 1239.6, salesCount: 37 }],
  };
}

export function demoRpm(): Rpm {
  return {
    totals: { views: 412_300, accrued: 1236.9, pending: 84.2, videos: 6 },
    byBrand: [{ brandId: ATELIER, brandName: "Atelier Hair", views: 412_300, accrued: 1236.9, pending: 84.2, videos: 6, rpmRate: 3 }],
  };
}

const CONTRACT = {
  en: `Gifting contract — {brand} × @lunaglow

The brand sends {product} free of charge. In exchange, the creator delivers the contents below (vertical videos of 20–45 s or photos) showing the product in real use, before the due date.

Contents expected: {count} (videos or photos).

Ad rights: the brand may use the contents in paid ads for 90 days from approval, in France, Belgium and Switzerland.

No payment is due for the contents themselves.`,
  fr: `Contrat de gifting — {brand} × @lunaglow

La marque envoie gratuitement {product}. En échange, la créatrice livre les contenus ci-dessous (vidéos verticales de 20 à 45 s ou photos) montrant le produit en usage réel, avant la date limite.

Contenus attendus : {count} (vidéos ou photos).

Droits publicitaires : la marque peut utiliser les contenus en publicité payante pendant 90 jours à compter de leur validation, en France, en Belgique et en Suisse.

Aucune rémunération n'est due pour les contenus eux-mêmes.`,
};

export function demoGifting(lang: "en" | "fr"): Gifting {
  const fr = lang === "fr";
  const contract = (brand: string, product: string, count: number) =>
    CONTRACT[lang].replaceAll("{brand}", brand).replace("{product}", product).replaceAll("{count}", String(count));
  return {
    campaigns: [
      { id: "c1", brand_id: LUMIERE, brand_name: "Lumière Skin", name: fr ? "Lancement sérum Glow" : "Glow Serum launch", product: fr ? "Sérum Glow 30 ml" : "Glow Serum 30 ml", deadline: "2026-10-12", video_count: 3, brief: fr ? "Montre ta routine du matin avec le sérum. Lumière naturelle, sans filtre, cite le code dans les 5 premières secondes. 2 vidéos et 1 photo." : "Show your morning routine with the serum. Real light, no filter, mention the code in the first 5 seconds. 2 videos and 1 photo." },
      { id: "c2", brand_id: OLIVE, brand_name: "Maison Olive", name: fr ? "Coffret des fêtes" : "Holiday gift set", product: fr ? "Coffret huile d’olive et savons" : "Olive oil and soap gift set", deadline: "2026-11-20", video_count: 2, brief: fr ? "Déballe le coffret et choisis ton produit préféré." : "Unbox the set and pick your favourite." },
      { id: "c3", brand_id: LUMIERE, brand_name: "Lumière Skin", name: fr ? "Collection SPF été" : "Summer SPF drop", product: fr ? "Brume SPF 50" : "SPF 50 body mist", deadline: "2026-08-30", video_count: 1, brief: fr ? "Sac de plage, juste avant la baignade." : "Beach bag, before a swim." },
    ],
    missions: [
      { id: "m1", campaign_id: "c1", user_id: LUMIERE, status: "delivered", contract_text: contract("Lumière Skin", fr ? "un sérum Glow 30 ml" : "one Glow Serum 30 ml", 3), signed_name: "Luna Park", carrier: "Colissimo", tracking_number: "6A21938476512" },
      { id: "m2", campaign_id: "c2", user_id: OLIVE, status: "invited", contract_text: contract("Maison Olive", fr ? "un coffret huile d’olive et savons" : "one olive oil and soap gift set", 2), signed_name: null, carrier: null, tracking_number: null },
      { id: "m3", campaign_id: "c3", user_id: LUMIERE, status: "approved", contract_text: contract("Lumière Skin", fr ? "une brume SPF 50" : "one SPF 50 body mist", 1), signed_name: "Luna Park", carrier: "UPS", tracking_number: "1Z999AA10123456784" },
    ],
    videos: [
      { mission_id: "m1", position: 1, kind: "video", name: "routine-matin.mp4", status: "approved", feedback: "" },
      { mission_id: "m1", position: 2, kind: "video", name: "gros-plan-texture.mov", status: "changes_requested", feedback: fr ? "Super ! Peux-tu montrer le code à l’écran dès le début ?" : "Great! Can you show the code on screen at the start?" },
      { mission_id: "m3", position: 1, kind: "video", name: "spf-plage.mp4", status: "approved", feedback: "" },
    ],
  };
}
