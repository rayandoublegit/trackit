import Page from "@/app/auth/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Connexion à Trackit",
  description: "Connectez-vous ou créez votre compte Trackit, marque ou créateur.",
  path: "/fr/auth",
  lang: "fr",
});

export default Page;
