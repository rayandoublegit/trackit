import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./fonts.module.css";
import "./landing.css";
import "./hero-doodles.css";

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  title: "Trackit — Find creators. Track sales. Pay commissions.",
  description: "Find creators, track sales, and pay commissions.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

const PRELOAD_FONTS = [
  "/fonts/InterDisplay-SemiBold.ttf",
  "/fonts/InterDisplay-Medium.ttf",
  "/fonts/InterDisplay-Regular.ttf",
  "/fonts/InterDisplay-Bold.ttf",
  "/fonts/InterDisplay-MediumItalic.ttf",
  "/fonts/InterDisplay-BoldItalic.ttf",
  "/fonts/InstrumentSans-Regular.ttf",
  "/fonts/InstrumentSans-Medium.ttf",
  "/fonts/InstrumentSans-SemiBold.ttf",
  "/fonts/InstrumentSans-Bold.ttf",
  "/fonts/InstrumentSans-Italic.ttf",
  "/fonts/InstrumentSans-BoldItalic.ttf",
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {PRELOAD_FONTS.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/ttf" crossOrigin="anonymous" />
        ))}
      </head>
      <body>
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
