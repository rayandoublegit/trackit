import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Klayan — From Idea to $10K MRR",
  description: "The AI co-founder that validates your startup idea in 10 minutes then tracks your progress to $10K MRR. Kill it, Flip it, or Build it — with real data, live competitors, and a full founder workspace.",
  keywords: "startup idea validation, AI co-founder, validate startup idea, idea validation tool, kill it flip it build it, startup validator, first customers SaaS, $10K MRR",
  authors: [{ name: "Klayan" }],
  creator: "Klayan",
  publisher: "Klayan",
  metadataBase: new URL("https://klayan.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://klayan.app",
    title: "Klayan — From Idea to $10K MRR",
    description: "The AI co-founder that validates your startup idea in 10 minutes then tracks your progress to $10K MRR.",
    siteName: "Klayan",
    images: [
      {
        url: "/images/navbarlogo.png",
        width: 180,
        height: 180,
        alt: "Klayan",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Klayan — From Idea to $10K MRR",
    description: "The AI co-founder that validates your startup idea in 10 minutes then tracks your progress to $10K MRR.",
    images: ["/images/navbarlogo.png"],
    creator: "@klayan_app",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var d=localStorage.getItem('klayan_dark');if(d===null||d==='1'){document.documentElement.setAttribute('data-dark','true');}})();` }} />
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
