import Page from "@/app/onboarding/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Bienvenue sur Trackit",
  description: "Configurez votre espace Trackit.",
  path: "/fr/onboarding",
  lang: "fr",
  noIndex: true,
});

export default Page;
