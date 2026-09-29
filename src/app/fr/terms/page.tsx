import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Conditions générales d'utilisation et de vente",
  description: "Conditions générales d'utilisation et de vente de Trackit, la plateforme d'affiliation créateurs.",
  path: "/fr/terms",
  lang: "fr",
});

export default function FrenchTermsPage() {
  return <LegalDocumentPage type="terms" />;
}
