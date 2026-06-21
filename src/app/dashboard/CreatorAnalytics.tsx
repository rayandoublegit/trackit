"use client";

import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import { useCreatorStats } from "@/lib/useCreatorStats";

const BLUE = "#0047FF";

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div style={{ flex: "1 1 200px", minWidth: 170, background: accent ? BLUE : "#FFFFFF", border: accent ? "none" : "1px solid #EFEFEF", borderRadius: 16, padding: "22px 24px", boxShadow: accent ? "0 8px 24px rgba(0,71,255,0.18)" : "0 1px 2px rgba(0,0,0,0.03)" }}>
      <div style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.85)" : "#9A9A9A", marginBottom: 10, letterSpacing: "-0.01em", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 650, color: accent ? "#FFFFFF" : "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.7)" : "#B0B0B0", marginTop: 8, letterSpacing: "-0.01em" }}>{hint}</div>}
    </div>
  );
}

function StepCard({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div style={{ flex: "1 1 240px", minWidth: 220, background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: "22px 24px" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,71,255,0.08)", color: BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{n}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 6, letterSpacing: "-0.02em" }}>{title}</div>
      <p style={{ fontSize: 13.5, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  );
}

export function CreatorAnalytics({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const { stats, loading } = useCreatorStats(userId);
  const firstName = stats?.creatorName?.replace(/^@/, "").split(" ")[0] ?? "";

  if (loading) {
    return (
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, color: "#9A9A9A", fontSize: 14, background: "#FFFFFF", minHeight: "100vh" }}>
        {lang === "fr" ? "Chargement de vos statistiques..." : "Loading your stats..."}
      </div>
    );
  }

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
  };

  const greeting = firstName
    ? (lang === "fr" ? `Bonjour ${firstName}` : `Hi ${firstName}`)
    : (lang === "fr" ? "Bonjour" : "Welcome");
  const subtitle = stats?.brandName
    ? (lang === "fr" ? `Voici un aperçu de votre partenariat avec ${stats.brandName}.` : `Here's an overview of your partnership with ${stats.brandName}.`)
    : (lang === "fr" ? "Voici un aperçu de votre activité de créateur." : "Here's an overview of your creator activity.");
  const sales = stats?.sales ?? [];

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, paddingBottom: 48, background: "#FFFFFF", minHeight: "100vh", flex: 1 }}>
      <div style={{ maxWidth: 920 }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.035em", margin: "0 0 8px" }}>{greeting}</h1>
          <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
          {stats?.discountCode && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, padding: "8px 14px", borderRadius: 999, background: "rgba(0,71,255,0.06)", border: "1px solid rgba(0,71,255,0.15)" }}>
              <span style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Votre code" : "Your code"}</span>
              <span style={{ fontSize: 13, fontWeight: 650, color: BLUE, letterSpacing: "0.02em" }}>{stats.discountCode}</span>
              {stats.commissionRate != null && (
                <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", letterSpacing: "-0.01em" }}>· {stats.commissionRate}%</span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <StatCard label={lang === "fr" ? "Ventes générées" : "Sales driven"} value={formatCurrency(stats?.totalSales ?? 0, lang)} hint={lang === "fr" ? "Total des commandes via votre code" : "Total orders via your code"} />
          <StatCard label={lang === "fr" ? "Commissions gagnées" : "Commissions earned"} value={formatCurrency(stats?.totalCommissions ?? 0, lang)} hint={lang === "fr" ? "Cumul depuis le début" : "All-time total"} />
          <StatCard label={lang === "fr" ? "Solde à recevoir" : "Balance due"} value={formatCurrency(stats?.balance ?? 0, lang)} hint={lang === "fr" ? "En attente de versement" : "Awaiting payout"} accent />
        </div>

        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid #EFEFEF", fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
            {lang === "fr" ? "Historique de mes ventes" : "My sales history"}
          </div>
          {sales.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(0,71,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 17l5-5 4 4 8-8" stroke="#0047FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 8h4v4" stroke="#0047FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 6, letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Vos ventes apparaîtront ici" : "Your sales will appear here"}
              </div>
              <p style={{ fontSize: 14, color: "rgba(0,0,0,0.45)", lineHeight: 1.5, margin: "0 auto", maxWidth: 360 }}>
                {lang === "fr"
                  ? "Dès qu'une commande passe avec votre code, elle s'affiche ici avec votre commission."
                  : "As soon as an order comes in with your code, it shows up here with your commission."}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #EFEFEF" }}>
                    <th style={{ textAlign: "left", padding: "12px 22px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Date" : "Date"}</th>
                    <th style={{ textAlign: "right", padding: "12px 22px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Montant vente" : "Sale amount"}</th>
                    <th style={{ textAlign: "right", padding: "12px 22px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Ma commission" : "My commission"}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id || `${s.date}-${s.orderAmount}`} style={{ borderBottom: "1px solid #F5F5F5" }}>
                      <td style={{ padding: "14px 22px", color: "#1A1A1A" }}>{fmtDate(s.date)}</td>
                      <td style={{ padding: "14px 22px", textAlign: "right", color: "#1A1A1A" }}>{formatCurrency(s.orderAmount, lang)}</td>
                      <td style={{ padding: "14px 22px", textAlign: "right", color: "#0047FF", fontWeight: 600 }}>{formatCurrency(s.commissionAmount, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 16px" }}>{lang === "fr" ? "Comment ça marche" : "How it works"}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <StepCard n={1} title={lang === "fr" ? "Partagez votre code" : "Share your code"} text={lang === "fr" ? "Diffusez votre code promo à votre audience sur vos réseaux." : "Share your promo code with your audience across your socials."} />
            <StepCard n={2} title={lang === "fr" ? "Vos abonnés achètent" : "Your followers buy"} text={lang === "fr" ? "Chaque commande passée avec votre code est suivie automatiquement." : "Every order placed with your code is tracked automatically."} />
            <StepCard n={3} title={lang === "fr" ? "Vous êtes payé" : "You get paid"} text={lang === "fr" ? "Vos commissions s'accumulent et vous sont versées sur votre IBAN." : "Your commissions add up and are paid out to your bank account."} />
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 16px" }}>{lang === "fr" ? "Conseils pour vendre plus" : "Tips to sell more"}</h2>
          <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: "8px 0" }}>
            {[
              lang === "fr" ? "Montrez le produit en situation réelle, pas juste un lien en bio." : "Show the product in real use, not just a link in bio.",
              lang === "fr" ? "Rappelez votre code à la fin de vos vidéos, c'est là qu'on agit." : "Repeat your code at the end of your videos, that's when people act.",
              lang === "fr" ? "Postez régulièrement : la répétition crée la confiance et les ventes." : "Post consistently: repetition builds trust and sales.",
            ].map((tip, i, arr) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 22px", borderBottom: i < arr.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(0,71,255,0.08)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#0047FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span style={{ fontSize: 14, color: "#1A1A1A", lineHeight: 1.5, letterSpacing: "-0.01em" }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #EFEFEF", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Propulsé par" : "Powered by"}</span>
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 18, width: "auto", opacity: 0.85 }} />
        </div>

      </div>
    </div>
  );
}
