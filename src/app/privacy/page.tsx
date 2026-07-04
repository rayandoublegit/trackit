import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description: "How Trackit collects, uses, and protects your data when you use our creator marketing platform.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <LegalDocumentPage type="privacy" />;
}
