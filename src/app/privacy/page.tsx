import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Trackit",
  description: "Privacy policy for Trackit.",
};

export default function PrivacyPage() {
  return <LegalDocumentPage type="privacy" />;
}
