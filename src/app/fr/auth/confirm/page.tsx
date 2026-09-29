import Page from "@/app/auth/confirm/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Confirmation de l'email",
  description: "Confirmez votre adresse email pour activer votre compte Trackit.",
  path: "/fr/auth/confirm",
  lang: "fr",
  noIndex: true,
});

export default Page;
