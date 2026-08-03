import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site-seo";
import "./auth.css";

export const metadata = buildPageMetadata({
  title: "Sign in to Trackit",
  description: "Sign in or create your Trackit account.",
  path: "/auth",
  noIndex: true,
});

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
