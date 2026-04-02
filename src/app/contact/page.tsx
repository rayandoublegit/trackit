"use client";

import { useState } from "react";
import Link from "next/link";

export default function ContactPage() {
  const [copied, setCopied] = useState(false);

  const copyEmail = () => {
    void navigator.clipboard.writeText("klayan.app@gmail.com");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background: "#000", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>

        <Link href="/" style={{ display: "inline-block", marginBottom: 48 }}>
          <img src="/images/navbarlogo.png" alt="Klayan" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: "#fff", marginBottom: 12 }}>
          Contact us
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", marginBottom: 48, lineHeight: 1.6 }}>
          Have a question, feedback, or need help? Reach out directly.
        </p>

        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 24,
        }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Email</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>klayan.app@gmail.com</div>
          </div>
          <button
            type="button"
            onClick={copyEmail}
            style={{
              background: copied ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${copied ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8,
              padding: "10px 20px",
              color: copied ? "#4ade80" : "#fff",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.2s",
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>

        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
          We typically respond within 24 hours.
        </p>

        <Link href="/" style={{ display: "inline-block", marginTop: 40, fontSize: 13, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
          ← Back to Klayan
        </Link>
      </div>
    </div>
  );
}
