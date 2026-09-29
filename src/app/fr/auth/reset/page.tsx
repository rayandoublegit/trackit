import Page from "@/app/auth/reset/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Nouveau mot de passe",
  description: "Choisissez un nouveau mot de passe pour votre compte Trackit.",
  path: "/fr/auth/reset",
  lang: "fr",
  noIndex: true,
});

export default Page;
