import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit creator portal",
  description: "Sign in to your Trackit creator account.",
  path: "/creator",
  noIndex: true,
});

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return children;
}
