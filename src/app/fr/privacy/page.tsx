import { LegalDocumentPage } from "@/components/LegalDocumentPage";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Politique de confidentialité",
  description: "Comment Trackit collecte, utilise et protège vos données personnelles.",
  path: "/fr/privacy",
  lang: "fr",
});

export default function FrenchPrivacyPage() {
  return <LegalDocumentPage type="privacy" />;
}
