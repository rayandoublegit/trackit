import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Join a Trackit campaign",
  description: "A brand invites you to join its campaign on Trackit.",
  path: "/join/[id]",
  noIndex: true,
});

export default function JoinLayout({ children }: { children: ReactNode }) {
  return children;
}
