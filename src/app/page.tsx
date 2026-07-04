import TrackitLanding from "@/components/TrackitLanding";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { HOME_FAQ_EN } from "@/lib/home-faq";
import { buildPageMetadata, faqJsonLd } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit — Creator affiliate platform for Shopify brands",
  description:
    "Trackit is the creator marketing platform for e-commerce brands. Discover TikTok creators, run affiliate campaigns, track Shopify sales, and pay commissions automatically.",
  path: "/",
  keywords: [
    "Trackit",
    "Trackit app",
    "Trackit platform",
    "Trackit creator marketing",
    "Trackit affiliate software",
    "thentrack.it",
    "creator affiliate platform",
  ],
});

export default function Home() {
  return (
    <>
      <SeoJsonLd data={faqJsonLd(HOME_FAQ_EN)} />
      <TrackitLanding />
    </>
  );
}
