import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Cookie Policy",
  description: "Which cookies Trackit uses, why, for how long, and how to accept, reject, or withdraw your consent.",
  path: "/cookies",
});

export default function CookiePolicyPage() {
  return <LegalDocumentPage type="cookies" />;
}
