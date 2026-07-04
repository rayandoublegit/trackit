import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit",
  description: "Trackit creator marketing platform.",
  path: "/v2",
  noIndex: true,
});

export default function V2Layout({ children }: { children: ReactNode }) {
  return children;
}
