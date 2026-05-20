import type { Metadata } from "next";
import "./fonts.module.css";
import "./landing.css";

export const metadata: Metadata = {
  title: "Trackit — Find creators. Track sales. Pay commissions.",
  description: "Find creators, track sales, and pay commissions.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
