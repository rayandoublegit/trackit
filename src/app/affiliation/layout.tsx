import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit affiliate program — Earn by referring brands",
  description:
    "Join the Trackit affiliate program. Refer e-commerce brands to Trackit and earn recurring commissions when they subscribe.",
  path: "/affiliation",
  keywords: ["Trackit affiliate program", "Trackit referral", "Trackit partner"],
});

export default function AffiliationLayout({ children }: { children: ReactNode }) {
  return children;
}
