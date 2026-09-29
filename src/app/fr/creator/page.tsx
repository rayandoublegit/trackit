import Page from "@/app/creator/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Espace créateur",
  description: "Votre espace créateur Trackit : missions, gifting, ventes et paiements.",
  path: "/fr/creator",
  lang: "fr",
  noIndex: true,
});

export default Page;
