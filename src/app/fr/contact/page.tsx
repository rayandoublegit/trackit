import Page from "@/app/contact/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Contact",
  description: "Une question sur Trackit ? Écrivez-nous, nous répondons sous 24 h.",
  path: "/fr/contact",
  lang: "fr",
});

export default Page;
