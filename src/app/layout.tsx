import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Klayan — Stop Building. Start Knowing.",
  description: "AI-powered idea validation for first-time SaaS builders.",
  icons: {
    icon: "https://i.ibb.co/FQszvMb/IMG-9312-2.jpg",
    apple: "https://i.ibb.co/FQszvMb/IMG-9312-2.jpg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="icon"
          href="https://i.ibb.co/FQszvMb/IMG-9312-2.jpg"
        />
        <link
          rel="apple-touch-icon"
          href="https://i.ibb.co/FQszvMb/IMG-9312-2.jpg"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
