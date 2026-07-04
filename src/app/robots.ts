import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/project/",
          "/settings/",
          "/verdict/",
          "/api/",
          "/auth/",
          "/onboarding/",
          "/admin/",
          "/v2/",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
