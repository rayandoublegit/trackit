import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit pricing — Plans for creator affiliate marketing",
  description:
    "Compare Trackit pricing plans for creator discovery, affiliate tracking, outreach, and commission payouts. Start free and scale as your creator program grows.",
  path: "/pricing",
  keywords: ["Trackit pricing", "Trackit plans", "creator marketing software pricing"],
});

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
