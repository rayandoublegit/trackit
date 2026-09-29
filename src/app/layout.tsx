import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  buildPageMetadata,
  buildRootMetadataVerification,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/site-seo";
import "./fonts.module.css";
import "./landing.css";
import "./chaotic-work.css";
import "./hero-doodles.css";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: "/",
  }),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | Trackit",
  },
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/blog/feed.xml",
    },
  },
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  applicationName: "Trackit",
  category: "business",
  verification: buildRootMetadataVerification(),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

// Only the weights painted above the fold; the rest load on demand.
const PRELOAD_FONTS = [
  "/fonts/InterDisplay-SemiBold.woff2",
  "/fonts/InterDisplay-Medium.woff2",
  "/fonts/InterDisplay-Bold.woff2",
  "/fonts/InterDisplay-Regular.woff2",
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {PRELOAD_FONTS.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{localStorage.setItem("trackit_lang","en");document.documentElement.lang="en"}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <SeoJsonLd data={[organizationJsonLd(), websiteJsonLd(), softwareApplicationJsonLd()]} />
        {children}
        <Script
          id="microsoft-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "wycxeotj7b");`,
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
