// Local preview only (NEXT_PUBLIC_DEV_BYPASS_PLAN): fictional data so the
// creator app can be seen without a database. Never used in production.

export const DEMO_STATS = {
  linked: true,
  brandName: "Lumière Skin",
  discountCode: "LUNA15",
  commissionRate: 15,
  totalSales: 8264,
  totalCommissions: 1239.6,
  balance: 184.5,
  totalEarned: 1239.6,
  salesCount: 37,
  sales: [
    { id: "s1", orderAmount: 64, commissionAmount: 9.6, date: "2026-09-29T14:12:00Z", brandName: "Lumière Skin" },
    { id: "s2", orderAmount: 128, commissionAmount: 19.2, date: "2026-09-28T19:40:00Z", brandName: "Lumière Skin" },
    { id: "s3", orderAmount: 48, commissionAmount: 7.2, date: "2026-09-27T09:05:00Z", brandName: "Lumière Skin" },
    { id: "s4", orderAmount: 96, commissionAmount: 14.4, date: "2026-09-25T21:30:00Z", brandName: "Lumière Skin" },
  ],
};

export const DEMO_LINK = { link: "https://thentrack.it/l/luna", code: "LUNA15" };

const CONTRACT = {
  en: `Gifting contract — Lumière Skin × @lunaglow

The brand sends {product} free of charge. In exchange, the creator publishes one vertical video (20–45 s) on TikTok showing the product in real use, before the due date.

Ad rights: the brand may use the video in paid ads for 90 days from approval, in France, Belgium and Switzerland.

No payment is due for the video itself. Sales made with the creator's code earn a 15 % commission.`,
  fr: `Contrat de gifting — Lumière Skin × @lunaglow

La marque envoie gratuitement {product}. En échange, la créatrice publie une vidéo verticale (20 à 45 s) sur TikTok montrant le produit en usage réel, avant la date limite.

Droits publicitaires : la marque peut utiliser la vidéo en publicité payante pendant 90 jours à compter de sa validation, en France, en Belgique et en Suisse.

Aucune rémunération n'est due pour la vidéo elle-même. Les ventes réalisées avec le code de la créatrice donnent droit à une commission de 15 %.`,
};

export function demoGifting(lang: "en" | "fr") {
  const fr = lang === "fr";
  const contract = (product: string) => CONTRACT[lang].replace("{product}", product);
  const serum = fr ? "un sérum Glow 30 ml" : "one Glow Serum 30 ml";
  const set = fr ? "un coffret des fêtes" : "one holiday gift set";
  const mist = fr ? "une brume SPF 50" : "one SPF 50 body mist";
  return {
    campaigns: [
      { id: "c1", name: fr ? "Lancement sérum Glow" : "Glow Serum launch", product: fr ? "Sérum Glow 30 ml" : "Glow Serum 30 ml", deadline: "2026-10-12", video_count: 1, brief: fr ? "Montre ta routine du matin avec le sérum. Lumière naturelle, sans filtre, cite le code dans les 5 premières secondes." : "Show your morning routine with the serum. Real light, no filter, mention the code in the first 5 seconds." },
      { id: "c2", name: fr ? "Coffret des fêtes" : "Holiday gift set", product: fr ? "Coffret des fêtes" : "Holiday gift set", deadline: "2026-11-20", video_count: 1, brief: fr ? "Déballe le coffret et choisis ton produit préféré." : "Unbox the set and pick your favourite." },
      { id: "c3", name: fr ? "Collection SPF été" : "Summer SPF drop", product: fr ? "Brume SPF 50" : "SPF 50 body mist", deadline: "2026-08-30", video_count: 1, brief: fr ? "Sac de plage, juste avant la baignade." : "Beach bag, before a swim." },
    ],
    missions: [
      { id: "m1", campaign_id: "c1", creator_handle: "lunaglow", creator_platform: "tiktok", status: "delivered", contract_text: contract(serum), signed_name: "Luna Park", signed_at: "2026-09-20T10:00:00Z", carrier: "Colissimo", tracking_number: "6A21938476512", address: null },
      { id: "m2", campaign_id: "c2", creator_handle: "lunaglow", creator_platform: "tiktok", status: "invited", contract_text: contract(set), signed_name: null, signed_at: null, carrier: null, tracking_number: null, address: null },
      { id: "m3", campaign_id: "c3", creator_handle: "lunaglow", creator_platform: "tiktok", status: "approved", contract_text: contract(mist), signed_name: "Luna Park", signed_at: "2026-08-01T10:00:00Z", carrier: "UPS", tracking_number: "1Z999AA10123456784", address: null },
    ],
    videos: [{ mission_id: "m3", name: "spf-plage.mp4", status: "approved", feedback: "" }],
  };
}
