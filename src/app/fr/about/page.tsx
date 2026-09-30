import { AboutView, aboutMetadata } from "./AboutView";

export const metadata = aboutMetadata("fr");

export default function FrenchAboutPage() {
  return <AboutView lang="fr" />;
}
