import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";
import "./onboarding.css";

export const metadata = buildPageMetadata({
  title: "Trackit onboarding",
  description: "Set up your Trackit account.",
  path: "/onboarding",
  noIndex: true,
});

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return children;
}
