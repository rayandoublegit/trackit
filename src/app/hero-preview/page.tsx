import type { Metadata } from "next";
import { HeroPreviewShell } from "./HeroPreviewShell";

export const metadata: Metadata = {
  title: "Hero preview",
  robots: { index: false, follow: false },
};

export default function HeroPreviewPage() {
  return <HeroPreviewShell />;
}
