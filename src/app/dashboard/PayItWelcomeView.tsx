"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLang, type Lang } from "@/lib/useLang";
import { SALES_UPDATED_EVENT } from "@/lib/outreach-history-events";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";
const SETUP_STARTED_KEY = "payit_setup_started";

type TrackedSale = { id: string };
type CompletedPayout = { id: string };
type CreatorRow = { balance?: number | string | null };

function walletBalanceStorageKey(userId: string) {
  return `trackit_wallet_balance_${userId}`;
}

function loadWalletBalance(userId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(walletBalanceStorageKey(userId));
    if (!raw) return 0;
    const value = parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

async function fetchTrackedSales(userId: string): Promise<TrackedSale[]> {
  const { supabase } = await import("@/lib/supabase");
  if (!supabase) return [];
  const { data, error } = await supabase.from("sales").select("id").eq("user_id", userId).limit(1);
  if (error) return [];
  return (data || []) as TrackedSale[];
}

export function hasPayItActivity(args: {
  sales: TrackedSale[];
  payouts: CompletedPayout[];
  creators: CreatorRow[];
  walletBalance?: number;
}): boolean {
  if ((args.walletBalance ?? 0) > 0) return true;
  if (args.sales.length > 0) return true;
  if (args.payouts.length > 0) return true;
  if (args.creators.some((c) => (Number(c.balance) || 0) > 0)) return true;
  return false;
}

export function markPayItSetupStarted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SETUP_STARTED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function hasPayItSetupStarted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SETUP_STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function usePayItActivity(userId?: string) {
  const [loading, setLoading] = useState(true);
  const [hasActivity, setHasActivity] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setHasActivity(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [sales, payoutRes, creatorsRes] = await Promise.all([
        fetchTrackedSales(userId),
        fetch("/api/payouts/history", { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/creators-list?userId=${userId}`).then((r) => r.json()),
      ]);
      const payouts = (payoutRes as { payouts?: CompletedPayout[] }).payouts ?? [];
      const creators = Array.isArray(creatorsRes) ? creatorsRes : [];
      const walletBalance = loadWalletBalance(userId);
      setHasActivity(hasPayItActivity({ sales, payouts, creators, walletBalance }));
    } catch {
      setHasActivity(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(SALES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SALES_UPDATED_EVENT, onUpdate);
  }, [refresh]);

  const showWelcome = !loading && !hasActivity;

  return { loading, hasActivity, showWelcome, refresh };
}

function PayItWelcomeMock({ lang, isMobile }: { lang: Lang; isMobile?: boolean }) {
  const mockPayouts =
    lang === "fr"
      ? [
          { name: "@sarah.creates", amount: "€ 420", status: "Payé", statusBg: "#E8F5E9", statusColor: "#2E7D32" },
          { name: "@mike.style", amount: "€ 280", status: "En attente", statusBg: "#FEF3C7", statusColor: "#B45309" },
          { name: "@luna.beauty", amount: "€ 150", status: "Commission", statusBg: "#EEF2FF", statusColor: "#0047FF" },
        ]
      : [
          { name: "@sarah.creates", amount: "€ 420", status: "Paid", statusBg: "#E8F5E9", statusColor: "#2E7D32" },
          { name: "@mike.style", amount: "€ 280", status: "Pending", statusBg: "#FEF3C7", statusColor: "#B45309" },
          { name: "@luna.beauty", amount: "€ 150", status: "Commission", statusBg: "#EEF2FF", statusColor: "#0047FF" },
        ];

  const avatarColors = ["#F9A8D4", "#93C5FD", "#C4B5FD"];

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 28,
        background: "linear-gradient(145deg, #0047FF 0%, #0038CC 55%, #002D99 100%)",
        padding: isMobile ? "32px 20px" : "40px 32px",
        minHeight: isMobile ? 360 : 440,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 24,
          right: 32,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 32,
          left: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 340,
          background: "#FFFFFF",
          borderRadius: 20,
          boxShadow: "0 24px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
          padding: "24px 22px 18px",
          border: "1px solid rgba(255,255,255,0.8)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: isMobile ? 44 : 52, objectFit: "contain" }} />
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #0047FF 0%, #003bd6 100%)",
            borderRadius: 16,
            padding: "18px 18px 16px",
            boxShadow: "0 12px 28px rgba(0, 71, 255, 0.28)",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", letterSpacing: "-0.01em", marginBottom: 4 }}>
            {lang === "fr" ? "Solde disponible" : "Available balance"}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.04em",
              marginBottom: 14,
              lineHeight: 1.05,
            }}
          >
            {lang === "fr" ? "2 450 €" : "€2,450"}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 16px",
              borderRadius: 999,
              background: "#FFFFFF",
              fontSize: 12,
              fontWeight: 600,
              color: "#1A1A1A",
              letterSpacing: "-0.02em",
            }}
          >
            Pay it
          </div>
        </div>

        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "Commissions à verser" : "Commissions owed"}
        </p>
        <p
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#1A1A1A",
            margin: "0 0 16px",
            letterSpacing: "-0.04em",
          }}
        >
          {lang === "fr" ? "840 €" : "€840"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {mockPayouts.map((row, i) => (
            <div
              key={row.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: i === 0 ? "1px solid #F3F4F6" : undefined,
                borderBottom: i < mockPayouts.length - 1 ? "1px solid #F3F4F6" : undefined,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: avatarColors[i],
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#FFF",
                }}
              >
                {row.name.charAt(1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>
                  {row.name}
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px" }}>{row.amount}</p>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: row.statusBg,
                    color: row.statusColor,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {row.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PayItWelcomeLoading({ isMobile }: { isMobile?: boolean }) {
  const pad = isMobile ? "56px 16px 48px" : "48px 48px 64px";
  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF", padding: pad }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", opacity: 0.5 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 56,
          }}
        >
          <div style={{ height: 420, borderRadius: 16, background: "#F5F5F5" }} />
          <div style={{ height: 440, borderRadius: 28, background: "#EEF2FF" }} />
        </div>
      </div>
    </div>
  );
}

export type PayItWelcomeVariant = "overview" | "balance" | "transactions";

export function payItWelcomePrimaryLabel(lang: Lang, variant: PayItWelcomeVariant): string {
  if (variant === "overview") {
    return lang === "fr" ? "Accéder à Pay it" : "Go to Pay it";
  }
  if (variant === "transactions") {
    return lang === "fr" ? "Accéder aux paiements" : "Go to Payments";
  }
  return lang === "fr" ? "Alimenter mon solde" : "Fund my balance";
}

export function PayItWelcomeView({
  isMobile,
  onPrimary,
  variant = "balance",
  primaryLabel,
}: {
  isMobile?: boolean;
  onPrimary: () => void;
  variant?: PayItWelcomeVariant;
  primaryLabel?: string;
}) {
  const lang = useLang();
  const pad = isMobile ? "56px 16px 48px" : "48px 48px 64px";

  const features: { icon: ReactNode; title: string; description: string }[] =
    lang === "fr"
      ? [
          {
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="6" width="18" height="14" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M3 10h18" stroke="#1A1A1A" strokeWidth="1.8" />
              </svg>
            ),
            title: "Solde centralisé",
            description:
              "Alimentez votre compte Trackit et payez tous vos créateurs depuis un seul endroit, sans multiplier les outils.",
          },
          {
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7H14a3.5 3.5 0 010 7H6" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
            title: "Commissions automatiques",
            description:
              "Les ventes Shopify calculent les commissions en temps réel. Vous savez exactement combien verser à chaque créateur.",
          },
          {
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16M4 12h10M4 17h14" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="19" cy="17" r="2.5" stroke="#1A1A1A" strokeWidth="1.8" />
              </svg>
            ),
            title: "Historique complet",
            description:
              "Suivez chaque paiement et commission dans un ledger clair, filtrable et groupé par mois.",
          },
        ]
      : [
          {
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="6" width="18" height="14" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M3 10h18" stroke="#1A1A1A" strokeWidth="1.8" />
              </svg>
            ),
            title: "Centralized balance",
            description:
              "Fund your Trackit account and pay all creators from one place — no more juggling tools.",
          },
          {
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7H14a3.5 3.5 0 010 7H6" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
            title: "Automatic commissions",
            description:
              "Shopify sales calculate commissions in real time. You always know exactly what each creator is owed.",
          },
          {
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16M4 12h10M4 17h14" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="19" cy="17" r="2.5" stroke="#1A1A1A" strokeWidth="1.8" />
              </svg>
            ),
            title: "Full payment history",
            description:
              "Track every payout and commission in a clear ledger — filterable and grouped by month.",
          },
        ];

  const cta = primaryLabel ?? payItWelcomePrimaryLabel(lang, variant);

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF" }}>
      <div style={{ padding: pad, maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 40 : 56,
            alignItems: "center",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: isMobile ? 32 : 38,
                fontWeight: 700,
                color: "#1A1A1A",
                margin: "0 0 32px",
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
              }}
            >
              {lang === "fr" ? (
                <>
                  Payez vos
                  <br />
                  créateurs simplement
                </>
              ) : (
                <>
                  Pay your creators
                  <br />
                  with ease
                </>
              )}
            </h1>

            <div style={{ display: "flex", flexDirection: "column", gap: 28, marginBottom: 40 }}>
              {features.map((f) => (
                <div key={f.title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div
                    style={{
                      flexShrink: 0,
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "#F9FAFB",
                      border: "1px solid #F0F0F0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                      {f.title}
                    </p>
                    <p style={{ fontSize: 14, color: "#6B7280", margin: 0, lineHeight: 1.55, letterSpacing: "-0.01em" }}>
                      {f.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="hero-cta-shopify"
              onClick={onPrimary}
              style={{ fontSize: 15, padding: "12px 24px" }}
            >
              {cta}
            </button>
          </div>

          <PayItWelcomeMock lang={lang} isMobile={isMobile} />
        </div>
      </div>
    </div>
  );
}
