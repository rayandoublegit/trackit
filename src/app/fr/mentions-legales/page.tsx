import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Mentions légales",
  description: "Éditeur, hébergeur, propriété intellectuelle et crédits du site thentrack.it et de l'application Trackit.",
  path: "/fr/mentions-legales",
  lang: "fr",
  languages: { en: "/legal-notice", fr: "/fr/mentions-legales" },
});

export default function FrenchLegalNoticePage() {
  return <LegalDocumentPage type="legal" />;
}
