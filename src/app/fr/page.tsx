import TrackitLanding from "@/components/TrackitLanding";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { HOME_FAQ_FR } from "@/lib/home-faq";
import { buildPageMetadata, faqJsonLd } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit — Plateforme d'affiliation créateurs pour les marques Shopify",
  description:
    "Trackit est la plateforme de marketing d'influence pour les marques e-commerce. Trouvez des créateurs TikTok, lancez des campagnes d'affiliation, suivez vos ventes Shopify et payez les commissions automatiquement.",
  path: "/fr",
  lang: "fr",
});

export default function FrenchHome() {
  return (
    <>
      <SeoJsonLd data={faqJsonLd(HOME_FAQ_FR)} />
      <TrackitLanding />
    </>
  );
}
