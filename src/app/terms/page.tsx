import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms & Conditions",
  description: "Terms and conditions for using Trackit, the creator affiliate marketing platform.",
  path: "/terms",
});

export default function TermsPage() {
  return <LegalDocumentPage type="terms" />;
}
