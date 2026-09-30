import { AboutView, aboutMetadata } from "@/app/fr/about/AboutView";

export const metadata = aboutMetadata("en");

export default function AboutPage() {
  return <AboutView lang="en" />;
}
