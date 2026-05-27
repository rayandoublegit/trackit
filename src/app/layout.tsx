import type { Metadata } from "next";
import "./fonts.module.css";
import "./landing.css";

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
      <body>{children}</body>
    </html>
  );
}
