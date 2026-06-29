import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocumentPage";

export const metadata: Metadata = {
  title: "Terms & Conditions — Trackit",
  description: "Terms and conditions for using Trackit.",
};

export default function TermsPage() {
  return <LegalDocumentPage type="terms" />;
}
