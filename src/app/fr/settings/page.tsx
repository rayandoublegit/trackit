import Page from "@/app/settings/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Réglages",
  description: "Réglages de votre compte Trackit.",
  path: "/fr/settings",
  lang: "fr",
  noIndex: true,
});

export default Page;
