import Page from "@/app/dashboard/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Tableau de bord",
  description: "Votre espace Trackit.",
  path: "/fr/dashboard",
  lang: "fr",
  noIndex: true,
});

export default Page;
