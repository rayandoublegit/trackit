import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Politique cookies",
  description: "Les cookies utilisés par Trackit, leurs finalités, leurs durées et comment accepter, refuser ou retirer votre consentement.",
  path: "/fr/cookies",
  lang: "fr",
});

export default function FrenchCookiePolicyPage() {
  return <LegalDocumentPage type="cookies" />;
}
