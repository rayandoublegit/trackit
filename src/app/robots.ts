import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/project/", "/settings/", "/verdict/", "/api/"],
    },
    sitemap: "https://klayan.app/sitemap.xml",
  };
}
