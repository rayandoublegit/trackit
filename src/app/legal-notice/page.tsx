import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Legal notice",
  description: "Publisher, hosting, intellectual property, and credits for thentrack.it and the Trackit app.",
  path: "/legal-notice",
  languages: { en: "/legal-notice", fr: "/fr/mentions-legales" },
});

export default function LegalNoticePage() {
  return <LegalDocumentPage type="legal" />;
}
