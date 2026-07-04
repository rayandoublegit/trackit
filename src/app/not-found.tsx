import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found | Trackit",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'InterDisplay', sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 12 }}>404</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>This page doesn&apos;t exist on Trackit.</p>
        <Link href="/" style={{ color: "#0047FF", fontWeight: 600, textDecoration: "none" }}>
          ← Back to Trackit
        </Link>
      </div>
    </main>
  );
}
