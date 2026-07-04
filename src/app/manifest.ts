import type { MetadataRoute } from "next";
import { DEFAULT_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site-seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0047FF",
    icons: [
      {
        src: "/favicon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    id: absoluteUrl("/"),
  };
}
