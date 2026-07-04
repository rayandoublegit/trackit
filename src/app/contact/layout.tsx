import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Contact Trackit — Support & sales",
  description:
    "Contact the Trackit team for product questions, billing help, or partnership inquiries. We typically respond within 24 hours.",
  path: "/contact",
  keywords: ["Contact Trackit", "Trackit support", "Trackit sales"],
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
