"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getSparkPriceId, getBuildPriceId, getScalePriceId } from "@/lib/checkout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type ProjectLang = "en" | "fr";

const projectI18n: Record<
  ProjectLang,
  Record<string, string>
> = {
  en: {
    back: "← Dashboard",
    active_project: "Active Project",
    view_verdict: "View original verdict →",
    building: "building",
    pivoting: "pivoting",
    killed: "killed",
    checkin_title: "Weekly Check-in",
    checkin_new: "+ New Check-in",
    checkin_week: "This week in review",
    checkin_talked: "Did you talk to users this week?",
    checkin_yes: "Yes ✓",
    checkin_no: "No",
    checkin_how_many: "How many?",
    checkin_build_days: "Days of building",
    checkin_revenue: "Revenue this week ($)",
    checkin_what: "What happened this week?",
    checkin_placeholder: "Wins, blockers, what you learned...",
    checkin_hint: "⌘ + Enter to save",
    checkin_submit: "Submit & get AI check-up →",
    checkin_submitting: "Generating your check-up...",
    checkin_report_title: "Your weekly check-up ✓",
    milestones_title: "Milestones",
    milestone_first_user: "First User",
    milestone_first_user_desc: "Someone is using your product",
    milestone_first_dollar: "First Dollar",
    milestone_first_dollar_desc: "First paying customer",
    milestone_1k: "$1K MRR",
    milestone_1k_desc: "First thousand in monthly revenue",
    milestone_10k: "$10K MRR",
    milestone_10k_desc: "Ten thousand monthly recurring revenue",
    milestone_claim: "I reached this →",
    milestone_claiming: "Generating...",
    market_title: "Market Watch",
    market_sub: "Live competitor intelligence scan",
    market_run: "Run scan →",
    market_running: "Scanning market...",
    market_empty: "No scans yet",
    market_empty_sub:
      "Run your first market scan to see what's changed since your verdict",
    cofounder_title: "Co-Founder Mode",
    cofounder_sub: "Strategic AI sessions with live web search",
    cofounder_open: "Start session →",
    cofounder_close: "Close session",
    cofounder_placeholder: "Describe your blocker...",
    cofounder_send: "Send",
    cofounder_thinking: "Thinking...",
    cofounder_empty: "What's your biggest blocker right now?",
    pivot_title: "Pivot Radar",
    pivot_sub: "Detects when you're drifting from what the market validated",
    pivot_run: "Run radar →",
    pivot_running: "Scanning...",
    pivot_empty: "No scan yet",
    pivot_empty_sub:
      "Run Pivot Radar after a few check-ins to detect if you're drifting",
    marketing_title: "Marketing Engine",
    marketing_sub: "Marketing angles, recruit radar & outreach messages",
    marketing_run: "Run engine →",
    marketing_running: "Generating...",
    marketing_empty: "No report yet",
    marketing_empty_sub:
      "Run the Marketing Engine to get angles, recruit tips and outreach messages tailored to your idea",
    outreach_title: "Outreach Engine",
    outreach_sub: "Ready-to-send messages for any target",
    outreach_target_label: "Who are you reaching out to?",
    outreach_run: "Generate messages →",
    outreach_running: "Writing...",
    outreach_empty: "No messages yet",
    outreach_empty_sub:
      "Select a target and generate ready-to-send outreach messages tailored to your idea",
    outreach_show: "+ Show messages",
    outreach_hide: "− Hide messages",
    competitor_title: "Competitor Tracker",
    competitor_sub: "Deep dive on your top 3 competitors with gaps to exploit",
    competitor_run: "Run tracker →",
    competitor_running: "Scanning competitors...",
    competitor_empty: "No tracker report yet",
    competitor_empty_sub:
      "Run the Competitor Tracker to get a deep dive on your top 3 competitors with real pricing and weaknesses",
    pricing_strategy_title: "Pricing Strategy",
    pricing_strategy_sub: "Recommended pricing model, tiers and psychological anchors",
    pricing_strategy_run: "Generate strategy →",
    pricing_strategy_running: "Analyzing... (15-30s)",
    pricing_strategy_empty: "No strategy yet",
    pricing_strategy_empty_sub:
      "Generate a pricing strategy tailored to your idea and current revenue stage",
    revenue_title: "Revenue Roadmap",
    revenue_sub: "Your phase by phase plan from $0 to $10K MRR",
    revenue_run: "Generate roadmap →",
    revenue_running: "Building roadmap... (15-30s)",
    revenue_empty: "No roadmap yet",
    revenue_empty_sub:
      "Generate your personalized revenue roadmap from where you are now to $10K MRR",
    notes_title: "Notes",
    notes_placeholder:
      "Write a note — ideas, blockers, customer feedback, decisions...",
    notes_hint: "⌘ + Enter to save",
    notes_save: "Save note",
    notes_saving: "Saving...",
    notes_empty: "No notes yet. Start documenting your journey.",
    notes_delete: "Delete",
    show_playbook: "+ Show playbook",
    hide_playbook: "− Hide playbook",
    show_report: "+ Show report",
    hide_report: "− Hide report",
    show_checkin: "+ Show check-up",
    hide_checkin: "− Hide check-up",
    show_radar: "+ Show radar report",
    hide_radar: "− Hide radar report",
    locked_upgrade: "Upgrade to",
    locked_available: "Available on the",
    locked_plan: "plan and above.",
    rename: "✎ rename",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading...",
    checkin_row_no_revenue: "No revenue",
    checkin_row_revenue: "revenue",
    locked_milestone_feature: "Milestone Engine",
  },
  fr: {
    back: "← Tableau de bord",
    active_project: "Projet actif",
    view_verdict: "Voir le verdict original →",
    building: "en construction",
    pivoting: "en pivot",
    killed: "abandonné",
    checkin_title: "Check-in hebdomadaire",
    checkin_new: "+ Nouveau check-in",
    checkin_week: "Cette semaine en revue",
    checkin_talked: "As-tu parlé à des utilisateurs cette semaine ?",
    checkin_yes: "Oui ✓",
    checkin_no: "Non",
    checkin_how_many: "Combien ?",
    checkin_build_days: "Jours de construction",
    checkin_revenue: "Revenus cette semaine (€)",
    checkin_what: "Qu'est-ce qui s'est passé cette semaine ?",
    checkin_placeholder: "Victoires, blocages, ce que tu as appris...",
    checkin_hint: "⌘ + Entrée pour sauvegarder",
    checkin_submit: "Soumettre & obtenir un bilan IA →",
    checkin_submitting: "Génération de ton bilan...",
    checkin_report_title: "Ton bilan hebdomadaire ✓",
    milestones_title: "Étapes Importantes",
    milestone_first_user: "Premier utilisateur",
    milestone_first_user_desc: "Quelqu'un utilise ton produit",
    milestone_first_dollar: "Premier dollar",
    milestone_first_dollar_desc: "Premier client payant",
    milestone_1k: "1K MRR",
    milestone_1k_desc: "Premier millier en revenus mensuels",
    milestone_10k: "10K MRR",
    milestone_10k_desc: "Dix mille en revenus mensuels récurrents",
    milestone_claim: "J'ai atteint cet objectif →",
    milestone_claiming: "Génération...",
    market_title: "Veille de marché",
    market_sub: "Scan de renseignement concurrentiel en direct",
    market_run: "Lancer le scan →",
    market_running: "Scan du marché...",
    market_empty: "Pas encore de scans",
    market_empty_sub:
      "Lance ton premier scan de marché pour voir ce qui a changé depuis ton verdict",
    cofounder_title: "Mode Co-Fondateur",
    cofounder_sub: "Sessions stratégiques IA avec recherche web en direct",
    cofounder_open: "Démarrer une session →",
    cofounder_close: "Fermer la session",
    cofounder_placeholder: "Décris ton blocage...",
    cofounder_send: "Envoyer",
    cofounder_thinking: "Réflexion...",
    cofounder_empty: "Quel est ton plus grand blocage en ce moment ?",
    pivot_title: "Radar de pivot",
    pivot_sub: "Détecte quand tu dérives de ce que le marché a validé",
    pivot_run: "Lancer le radar →",
    pivot_running: "Scan...",
    pivot_empty: "Pas encore de scan",
    pivot_empty_sub:
      "Lance le radar de pivot après quelques check-ins pour détecter si tu dérives",
    marketing_title: "Moteur Marketing",
    marketing_sub: "Angles marketing, radar de recrutement & messages de prospection",
    marketing_run: "Lancer →",
    marketing_running: "Génération...",
    marketing_empty: "Pas encore de rapport",
    marketing_empty_sub:
      "Lance le Moteur Marketing pour obtenir des angles, conseils de recrutement et messages de prospection adaptés à ton idée",
    outreach_title: "Moteur de Prospection",
    outreach_sub: "Messages prêts à envoyer pour n'importe quelle cible",
    outreach_target_label: "À qui tu t'adresses ?",
    outreach_run: "Générer les messages →",
    outreach_running: "Rédaction...",
    outreach_empty: "Pas encore de messages",
    outreach_empty_sub:
      "Sélectionne une cible et génère des messages de prospection prêts à envoyer adaptés à ton idée",
    outreach_show: "+ Voir les messages",
    outreach_hide: "− Masquer les messages",
    competitor_title: "Suivi des Concurrents",
    competitor_sub: "Analyse approfondie de tes 3 principaux concurrents avec les failles à exploiter",
    competitor_run: "Lancer le suivi →",
    competitor_running: "Scan des concurrents...",
    competitor_empty: "Pas encore de rapport",
    competitor_empty_sub:
      "Lance le Suivi des Concurrents pour une analyse approfondie de tes 3 principaux concurrents avec prix réels et faiblesses",
    pricing_strategy_title: "Stratégie de Prix",
    pricing_strategy_sub: "Modèle de prix recommandé, paliers et ancres psychologiques",
    pricing_strategy_run: "Générer la stratégie →",
    pricing_strategy_running: "Analyse... (15-30s)",
    pricing_strategy_empty: "Pas encore de stratégie",
    pricing_strategy_empty_sub:
      "Génère une stratégie de prix adaptée à ton idée et à ton stade de revenus actuel",
    revenue_title: "Roadmap des Revenus",
    revenue_sub: "Ton plan phase par phase de 0 à 10K MRR",
    revenue_run: "Générer la feuille de route →",
    revenue_running: "Construction... (15-30s)",
    revenue_empty: "Pas encore de feuille de route",
    revenue_empty_sub:
      "Génère ta feuille de route personnalisée depuis où tu en es jusqu'à 10K MRR",
    notes_title: "Notes",
    notes_placeholder:
      "Écris une note — idées, blocages, retours clients, décisions...",
    notes_hint: "⌘ + Entrée pour sauvegarder",
    notes_save: "Sauvegarder la note",
    notes_saving: "Sauvegarde...",
    notes_empty: "Pas encore de notes. Commence à documenter ton parcours.",
    notes_delete: "Supprimer",
    show_playbook: "+ Voir le playbook",
    hide_playbook: "− Masquer le playbook",
    show_report: "+ Voir le rapport",
    hide_report: "− Masquer le rapport",
    show_checkin: "+ Voir le bilan",
    hide_checkin: "− Masquer le bilan",
    show_radar: "+ Voir le rapport radar",
    hide_radar: "− Masquer le rapport radar",
    locked_upgrade: "Passer à",
    locked_available: "Disponible avec le plan",
    locked_plan: "et supérieur.",
    rename: "✎ renommer",
    save: "Sauvegarder",
    cancel: "Annuler",
    loading: "Chargement...",
    checkin_row_no_revenue: "Pas de revenus",
    checkin_row_revenue: "de revenus",
    locked_milestone_feature: "Moteur de jalons",
  },
};

type Project = {
  id: string;
  idea_name: string;
  status: string;
  created_at: string;
  analysis_id: string;
};

type Note = {
  id: string;
  content: string;
  created_at: string;
};

function PlaybookToggle({
  playbook,
  lang,
}: {
  playbook: string;
  lang: ProjectLang;
}) {
  const [open, setOpen] = useState(true);
  const t = projectI18n[lang];
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0, letterSpacing: "-0.01em" }}
      >
        {open ? t.hide_playbook : t.show_playbook}
      </button>
      {open ? <ReportDisplay text={playbook} /> : null}
    </div>
  );
}

function MarketWatchToggle({
  report,
  lang,
}: {
  report: string;
  lang: ProjectLang;
}) {
  const [open, setOpen] = useState(true);
  const t = projectI18n[lang];
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0, letterSpacing: "-0.01em" }}
      >
        {open ? t.hide_report : t.show_report}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function CheckinReportToggle({
  report,
  lang,
}: {
  report: string;
  lang: ProjectLang;
}) {
  const [open, setOpen] = useState(true);
  const t = projectI18n[lang];
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0, letterSpacing: "-0.01em" }}
      >
        {open ? t.hide_checkin : t.show_checkin}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function PivotReportToggle({
  report,
  lang,
}: {
  report: string;
  lang: ProjectLang;
}) {
  const [open, setOpen] = useState(true);
  const t = projectI18n[lang];
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0, letterSpacing: "-0.01em" }}
      >
        {open ? t.hide_radar : t.show_radar}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function MarketingReportToggle({ report }: { report: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {open ? "− Hide report" : "+ Show report"}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function OutreachToggle({ report }: { report: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {open ? "− Hide messages" : "+ Show messages"}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function CompetitorToggle({ report }: { report: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {open ? "− Hide report" : "+ Show report"}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function PricingToggle({ report }: { report: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {open ? "− Hide strategy" : "+ Show strategy"}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function RevenueToggle({ report }: { report: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {open ? "− Hide roadmap" : "+ Show roadmap"}
      </button>
      {open ? <ReportDisplay text={report} /> : null}
    </div>
  );
}

function ReportDisplay({ text }: { text: string }) {
  const cleaned = text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F004}]|[\u{1F0CF}]|⚡|⚠️|🎯|🔓|🔒|✅|👤|💵|🚀|🔥|❌|🎉|👋|💡|📊|👁️|🤝/gu, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\.\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*\.\s*\n/g, "\n")
    .replace(/^[\s.]+$/gm, "")
    .replace(/\s*\.\s*$/gm, "")
    .replace(/^\s*\.\s*/gm, "")
    .trim();

  const lines = cleaned.split("\n");

  return (
    <div style={{ marginTop: 12 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const isDivider = /^━{5,}/.test(trimmed);
        const isKlayanHeader = trimmed.startsWith("KLAYAN") && trimmed.includes("—");
        const isHeader = /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇÆŒ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇÆŒ\s\-—']+$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 80 && !trimmed.startsWith("0");
        const isNumbered = /^[›]?\s*\d{2}\s*—/.test(trimmed) || /^\d{2}\s*—/.test(trimmed);
        const isVerdict = trimmed.startsWith("——") || trimmed.includes("BUILD IT") || trimmed.includes("KILL IT") || trimmed.includes("FLIP IT") || trimmed.startsWith("SCORE DE DÉRIVE") || trimmed.startsWith("DRIFT SCORE");

        if (isDivider) return <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "20px 0" }} />;
        if (isKlayanHeader) return null;
        if (isVerdict) return <div key={i} style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em", margin: "16px 0", textAlign: "center" }}>{trimmed}</div>;
        if (isHeader) return (
          <div key={i} style={{ marginTop: 24, marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{trimmed}</span>
          </div>
        );
        if (isNumbered) return (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, marginTop: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0, fontSize: 13 }}>›</span>
            <span style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.8)" }}>{trimmed.replace(/^[›]?\s*\d{2}\s*—\s*/, "")}</span>
          </div>
        );
        if (!trimmed) {
          // Skip if previous line was also empty
          const prevLine = lines[i - 1]?.trim();
          if (!prevLine) return null;
          return <div key={i} style={{ height: 8 }} />;
        }
        return <div key={i} style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>{trimmed}</div>;
      })}
    </div>
  );
}

function EditableTitle({
  value,
  onSave,
  lang,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  lang: ProjectLang;
}) {
  const t = projectI18n[lang];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const save = async () => {
    if (!draft.trim() || draft === value) { setEditing(false); return; }
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: "1px solid rgba(255,255,255,0.3)",
            color: "#fff",
            fontFamily: "'Inter', sans-serif",
            fontSize: "clamp(24px, 4vw, 40px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            outline: "none",
            width: "100%",
            padding: "0 0 4px 0",
          }}
        />
        <button type="button" onClick={() => void save()} disabled={saving} style={{ background: "#fff", color: "#000", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {saving ? "..." : t.save}
        </button>
        <button type="button" onClick={() => setEditing(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
          {t.cancel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <h1 style={{ fontSize: "clamp(24px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}>
        {value}
      </h1>
      <button
        type="button"
        onClick={() => { setDraft(value); setEditing(true); }}
        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 12, padding: 0, flexShrink: 0 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
      >
        {t.rename}
      </button>
    </div>
  );
}

async function upgradeToNextPlan(currentPlan: string) {
  const targetPlan =
    currentPlan === "free" ? "spark" :
    currentPlan === "spark" ? "build" :
    "scale";
  const priceId =
    targetPlan === "spark"
      ? getSparkPriceId()
      : targetPlan === "build"
        ? getBuildPriceId()
        : getScalePriceId();
  if (!priceId || !supabase) {
    window.location.href = `/pricing?plan=${targetPlan}`;
    return;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "/auth";
    return;
  }
  const res = await fetch("/api/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId,
      userId: user.id,
      email: user.email,
      cancelUrl: window.location.href,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { url?: string };
  if (payload.url) {
    window.location.href = payload.url;
    return;
  }
  window.location.href = `/pricing?plan=${targetPlan}`;
}

function LockedFeature({ feature, requiredPlan, userPlan }: { feature: string; requiredPlan: string; userPlan: string }) {
  const lang = useLang();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    await upgradeToNextPlan(userPlan);
    setLoading(false);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16,
      padding: "40px 32px",
      textAlign: "center",
      marginBottom: 48,
    }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8, color: "#fff" }}>
        {feature}
      </div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8, lineHeight: 1.6 }}>
        {lang === "fr"
          ? <>Disponible avec le plan <strong style={{ color: "#fff" }}>{requiredPlan}</strong> et supérieur.</>
          : <>Available on the <strong style={{ color: "#fff" }}>{requiredPlan}</strong> plan and above.</>
        }
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 24, lineHeight: 1.6 }}>
        {lang === "fr"
          ? userPlan === "free"
            ? "Passez à un plan payant pour accéder à votre workspace complet."
            : `Passez de ${userPlan} pour débloquer cette fonctionnalité.`
          : userPlan === "free"
            ? "Upgrade to unlock your full workspace."
            : `Upgrade from ${userPlan} to unlock this feature.`
        }
      </div>
      <button
        type="button"
        onClick={() => void handleUpgrade()}
        disabled={loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#ffffff",
          color: "#000000",
          border: "none",
          borderRadius: 100,
          padding: "12px 28px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "-0.02em",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading
          ? (lang === "fr" ? "Redirection..." : "Redirecting...")
          : (lang === "fr" ? `Passer à ${requiredPlan} →` : `Upgrade to ${requiredPlan} →`)
        }
      </button>
    </div>
  );
}

function playPopSound(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.05);
    oscillator.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const lang = useLang();
  const t = projectI18n[lang];

  const [project, setProject] = useState<Project | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [checkins, setCheckins] = useState<Array<{
    id: string;
    talked_to_users: boolean;
    users_count: number;
    build_days: number;
    revenue: number;
    notes: string;
    ai_report: string;
    created_at: string;
  }>>([]);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinForm, setCheckinForm] = useState({
    talked_to_users: false,
    users_count: 0,
    build_days: 0,
    revenue: 0,
    notes: "",
  });
  const [submittingCheckin, setSubmittingCheckin] = useState(false);
  const [checkinReport, setCheckinReport] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Array<{
    id: string;
    type: string;
    achieved_at: string | null;
    playbook: string | null;
  }>>([]);
  const [claimingMilestone, setClaimingMilestone] = useState<string | null>(null);
  const [marketWatches, setMarketWatches] = useState<Array<{
    id: string;
    report: string;
    created_at: string;
  }>>([]);
  const [runningMarketWatch, setRunningMarketWatch] = useState(false);
  const [showCofounder, setShowCofounder] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [pivotReport, setPivotReport] = useState<string | null>(null);
  const [runningPivot, setRunningPivot] = useState(false);
  const [marketingReport, setMarketingReport] = useState<string | null>(null);
  const [runningMarketing, setRunningMarketing] = useState(false);
  const [outreachReport, setOutreachReport] = useState<string | null>(null);
  const [runningOutreach, setRunningOutreach] = useState(false);
  const [outreachTarget, setOutreachTarget] = useState("Potential customer");
  const [competitorReport, setCompetitorReport] = useState<string | null>(null);
  const [runningCompetitor, setRunningCompetitor] = useState(false);
  const [pricingReport, setPricingReport] = useState<string | null>(null);
  const [runningPricing, setRunningPricing] = useState(false);
  const [revenueReport, setRevenueReport] = useState<string | null>(null);
  const [runningRevenue, setRunningRevenue] = useState(false);
  const [userPlan, setUserPlan] = useState<"free" | "spark" | "build" | "scale">("free");
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth"); return; }
      setUser(user);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .maybeSingle();

      const plan = profileRow?.plan ?? "free";
      setUserPlan(plan === "build" || plan === "scale" || plan === "spark" ? plan : "free");

      const { data: projectData } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (!projectData) { router.replace("/dashboard"); return; }
      setProject(projectData);

      const { data: notesData } = await supabase
        .from("notes")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setNotes(notesData ?? []);

      const { data: checkinsData } = await supabase
        .from("checkins")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setCheckins(checkinsData ?? []);

      const { data: milestonesData } = await supabase
        .from("milestones")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", user.id);

      setMilestones(milestonesData ?? []);

      const { data: reportsData } = await supabase
        .from("reports")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (reportsData) {
        for (const r of reportsData) {
          if (r.type === "checkin_report") setCheckinReport(r.content as string);
          if (r.type === "pivot") setPivotReport(r.content as string);
          if (r.type === "marketing") setMarketingReport(r.content as string);
          if (r.type === "outreach") setOutreachReport(r.content as string);
          if (r.type === "competitor") setCompetitorReport(r.content as string);
          if (r.type === "pricing") setPricingReport(r.content as string);
          if (r.type === "revenue") setRevenueReport(r.content as string);
        }
      }

      const { data: marketWatchData } = await supabase
        .from("market_watches")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setMarketWatches(marketWatchData ?? []);
      setLoading(false);
    })();
  }, [id, router]);

  useEffect(() => {
    const init = () => {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
    };
    window.addEventListener("click", init, { once: true });
    return () => window.removeEventListener("click", init);
  }, []);

  const addNote = useCallback(async () => {
    if (!newNote.trim() || !supabase || !user) return;
    setSavingNote(true);
    const { data } = await supabase
      .from("notes")
      .insert({
        project_id: id,
        user_id: user.id,
        content: newNote.trim(),
      })
      .select()
      .single();
    if (data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setSavingNote(false);
  }, [newNote, id, user]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (!supabase) return;
    await supabase.from("notes").delete().eq("id", noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);





  const submitCheckin = useCallback(async () => {
    if (!supabase || !user) return;
    setSubmittingCheckin(true);
    setCheckinReport(null);

    // Save checkin to DB
    const { data: checkinData } = await supabase
      .from("checkins")
      .insert({
        project_id: id,
        user_id: user.id,
        talked_to_users: checkinForm.talked_to_users,
        users_count: checkinForm.users_count,
        build_days: checkinForm.build_days,
        revenue: checkinForm.revenue,
        notes: checkinForm.notes,
      })
      .select()
      .single();

    if (!checkinData) { setSubmittingCheckin(false); return; }

    // Generate AI report
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        ideaName: project?.idea_name,
        checkinId: checkinData.id,
        talkedToUsers: checkinForm.talked_to_users,
        usersCount: checkinForm.users_count,
        buildDays: checkinForm.build_days,
        revenue: checkinForm.revenue,
        notes: checkinForm.notes,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };
    if (payload.report) {
      setCheckinReport(payload.report);
      await supabase.from("reports").upsert(
        { project_id: id, user_id: user.id, type: "checkin_report", content: payload.report },
        { onConflict: "project_id,user_id,type" }
      );
      playPopSound(audioCtxRef.current);
      await supabase.from("checkins").update({ ai_report: payload.report }).eq("id", checkinData.id);
      setCheckins((prev) => [{ ...checkinData, ai_report: payload.report ?? "" }, ...prev]);
    }

    setSubmittingCheckin(false);
    setShowCheckin(false);
    setCheckinForm({ talked_to_users: false, users_count: 0, build_days: 0, revenue: 0, notes: "" });
  }, [checkinForm, id, user, project, lang]);

  const claimMilestone = useCallback(async (type: string) => {
    if (!supabase || !user) return;
    setClaimingMilestone(type);

    const res = await fetch("/api/milestone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        userId: user.id,
        type,
        ideaName: project?.idea_name,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { playbook?: string };

    const { data } = await supabase
      .from("milestones")
      .insert({
        project_id: id,
        user_id: user.id,
        type,
        achieved_at: new Date().toISOString(),
        playbook: payload.playbook ?? null,
      })
      .select()
      .single();

    if (data) {
      setMilestones((prev) => [...prev, data]);
      if (data.playbook) playPopSound(audioCtxRef.current);
    }
    setClaimingMilestone(null);
  }, [id, user, project, lang]);

  const runMarketWatch = useCallback(async () => {
    if (!supabase || !user) return;
    setRunningMarketWatch(true);

    const res = await fetch("/api/market-watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        userId: user.id,
        ideaName: project?.idea_name,
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };

    if (payload.report) {
      setMarketWatches((prev) => [{
        id: Date.now().toString(),
        report: payload.report!,
        created_at: new Date().toISOString(),
      }, ...prev]);
      playPopSound(audioCtxRef.current);
    }

    setRunningMarketWatch(false);
  }, [id, user, project, lang]);

  const runPivotRadar = useCallback(async () => {
    if (!supabase || !user) return;
    setRunningPivot(true);
    setPivotReport(null);

    const recentNotes = notes.slice(0, 10);
    const recentCheckins = checkins.slice(0, 5);

    const res = await fetch("/api/pivot-radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ideaName: project?.idea_name,
        checkins: recentCheckins,
        notes: recentNotes,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };
    if (payload.report) {
      setPivotReport(payload.report);
      await supabase.from("reports").upsert(
        { project_id: id, user_id: user.id, type: "pivot", content: payload.report },
        { onConflict: "project_id,user_id,type" }
      );
      playPopSound(audioCtxRef.current);
    }
    setRunningPivot(false);
  }, [user, project, notes, checkins, id, lang]);

  const runMarketingEngine = useCallback(async () => {
    if (!supabase || !user) return;
    setRunningMarketing(true);
    setMarketingReport(null);

    const res = await fetch("/api/marketing-engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ideaName: project?.idea_name,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        checkins: checkins.slice(0, 3),
        notes: notes.slice(0, 5),
        marketWatches: marketWatches.slice(0, 1),
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };
    if (payload.report) {
      setMarketingReport(payload.report);
      await supabase.from("reports").upsert(
        { project_id: id, user_id: user.id, type: "marketing", content: payload.report },
        { onConflict: "project_id,user_id,type" }
      );
      playPopSound(audioCtxRef.current);
    }
    setRunningMarketing(false);
  }, [user, project, checkins, notes, marketWatches, id, lang]);

  const runOutreachEngine = useCallback(async () => {
    if (!supabase || !user) return;
    setRunningOutreach(true);
    setOutreachReport(null);

    const context = notes.slice(0, 3).map((n) => n.content).join("\n");

    const res = await fetch("/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ideaName: project?.idea_name,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        targetType: outreachTarget,
        context,
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };
    if (payload.report) {
      setOutreachReport(payload.report);
      await supabase.from("reports").upsert(
        { project_id: id, user_id: user.id, type: "outreach", content: payload.report },
        { onConflict: "project_id,user_id,type" }
      );
      playPopSound(audioCtxRef.current);
    }
    setRunningOutreach(false);
  }, [user, project, notes, outreachTarget, id, lang]);

  const runCompetitorTracker = useCallback(async () => {
    if (!supabase || !user) return;
    setRunningCompetitor(true);
    setCompetitorReport(null);

    const res = await fetch("/api/competitor-tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ideaName: project?.idea_name,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };
    if (payload.report) {
      setCompetitorReport(payload.report);
      await supabase.from("reports").upsert(
        { project_id: id, user_id: user.id, type: "competitor", content: payload.report },
        { onConflict: "project_id,user_id,type" }
      );
      playPopSound(audioCtxRef.current);
    }
    setRunningCompetitor(false);
  }, [user, project, id, lang]);

  const runPricingStrategy = useCallback(async () => {
    if (!supabase || !user) return;
    setRunningPricing(true);
    setPricingReport(null);

    const res = await fetch("/api/pricing-strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ideaName: project?.idea_name,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        checkins: checkins.slice(0, 5),
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };
    if (payload.report) {
      setPricingReport(payload.report);
      await supabase.from("reports").upsert(
        { project_id: id, user_id: user.id, type: "pricing", content: payload.report },
        { onConflict: "project_id,user_id,type" }
      );
      playPopSound(audioCtxRef.current);
    }
    setRunningPricing(false);
  }, [user, project, checkins, id, lang]);

  const runRevenueRoadmap = useCallback(async () => {
    if (!supabase || !user) return;
    setRunningRevenue(true);
    setRevenueReport(null);

    const res = await fetch("/api/revenue-roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ideaName: project?.idea_name,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        checkins: checkins.slice(0, 5),
        milestones,
        lang,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { report?: string };
    if (payload.report) {
      setRevenueReport(payload.report);
      await supabase.from("reports").upsert(
        { project_id: id, user_id: user.id, type: "revenue", content: payload.report },
        { onConflict: "project_id,user_id,type" }
      );
      playPopSound(audioCtxRef.current);
    }
    setRunningRevenue(false);
  }, [user, project, checkins, milestones, id, lang]);

  const deleteReport = useCallback(async (type: string) => {
    if (!supabase || !user) return;
    await supabase.from("reports").delete().eq("project_id", id).eq("user_id", user.id).eq("type", type);
    if (type === "pivot") setPivotReport(null);
    if (type === "marketing") setMarketingReport(null);
    if (type === "outreach") setOutreachReport(null);
    if (type === "competitor") setCompetitorReport(null);
    if (type === "pricing") setPricingReport(null);
    if (type === "revenue") setRevenueReport(null);
    if (type === "checkin_report") setCheckinReport(null);
  }, [supabase, user, id]);

  const resetWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    setResetting(true);

    await Promise.all([
      supabase.from("checkins").delete().eq("project_id", id).eq("user_id", user.id),
      supabase.from("milestones").delete().eq("project_id", id).eq("user_id", user.id),
      supabase.from("market_watches").delete().eq("project_id", id).eq("user_id", user.id),
      supabase.from("notes").delete().eq("project_id", id).eq("user_id", user.id),
      supabase.from("reports").delete().eq("project_id", id).eq("user_id", user.id),
    ]);

    setCheckins([]);
    setMilestones([]);
    setMarketWatches([]);
    setNotes([]);
    setCheckinReport(null);
    setPivotReport(null);
    setMarketingReport(null);
    setOutreachReport(null);
    setCompetitorReport(null);
    setPricingReport(null);
    setRevenueReport(null);
    setShowResetConfirm(false);
    setResetting(false);
  }, [supabase, user, id]);

  const clearCheckinRowAiReport = useCallback(async (checkinId: string) => {
    if (!supabase) return;
    await supabase.from("checkins").update({ ai_report: "" }).eq("id", checkinId);
    setCheckins((prev) => prev.map((c) => (c.id === checkinId ? { ...c, ai_report: "" } : c)));
  }, [supabase]);

  const deleteMarketWatch = useCallback(async (watchId: string) => {
    if (!supabase) return;
    await supabase.from("market_watches").delete().eq("id", watchId);
    setMarketWatches((prev) => prev.filter((w) => w.id !== watchId));
  }, [supabase]);

  const clearMilestonePlaybook = useCallback(async (milestoneId: string) => {
    if (!supabase) return;
    await supabase.from("milestones").update({ playbook: null }).eq("id", milestoneId);
    setMilestones((prev) => prev.map((m) => (m.id === milestoneId ? { ...m, playbook: null } : m)));
  }, [supabase]);

  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    const recentNotes = notes.slice(0, 3).map((n) => n.content).join("\n");

    const res = await fetch("/api/cofounder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...chatMessages, userMsg],
        ideaName: project?.idea_name,
        username: user?.user_metadata?.username ?? user?.email?.split("@")[0] ?? "founder",
        notes: recentNotes,
      }),
    });

    const payload = await res.json().catch(() => ({})) as { reply?: string };
    if (payload.reply) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: payload.reply! }]);
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, chatMessages, notes, project, user]);

  const updateStatus = useCallback(async (status: string) => {
    if (!supabase || !project) return;
    await supabase.from("projects").update({ status }).eq("id", project.id);
    setProject((prev) => prev ? { ...prev, status } : prev);
  }, [project]);

  const statusColor = (status: string) => {
    if (status === "building") return "#4ade80";
    if (status === "pivoting") return "#facc15";
    if (status === "killed") return "#f87171";
    return "#ffffff";
  };

  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("checkin");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedReports, setCollapsedReports] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("klayan_dark");
    setDarkMode(saved === null ? true : saved === "1");
    setMounted(true);
  }, []);

  const D = darkMode;
  const th = {
    bg: D ? "#0d0d0d" : "#f5f5f5",
    sidebar: D ? "#111" : "#fff",
    sidebarBorder: D ? "#222" : "#e5e5e5",
    text: D ? "#f0f0f0" : "#111",
    textMuted: D ? "#888" : "#666",
    cardBg: D ? "#1a1a1a" : "#fff",
    cardBorder: D ? "#2a2a2a" : "#e5e5e5",
    activeNav: D ? "#2b2d31" : "#e8e8e8",
    inputBg: D ? "#1a1a1a" : "#fff",
    divider: D ? "#222" : "#e5e5e5",
  };

  const canAccess = (plan: string) => {
    const order = ["free", "spark", "build", "scale"];
    return order.indexOf(userPlan) >= order.indexOf(plan.toLowerCase());
  };

  const navItems = [
    { id: "checkin", label: t.checkin_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'/></svg>", plan: "spark", group: "Core" },
    { id: "milestones", label: t.milestones_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d='M6 9H4.5a2.5 2.5 0 010-5H6m12 5h1.5a2.5 2.5 0 000-5H18M8 21h8m-4-4v4m-7-4a7 7 0 0114 0H5z'/></svg>", plan: "free", group: "Core" },
    { id: "market", label: t.market_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d='M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M12 12h.01'/></svg>", plan: "build", group: "Intelligence" },
    { id: "competitor", label: t.competitor_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><circle cx='11' cy='11' r='8'/><path d='m21 21-4.35-4.35'/></svg>", plan: "build", group: "Intelligence" },
    { id: "pivot", label: t.pivot_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d='M1 4v6h6M23 20v-6h-6'/><path d='M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15'/></svg>", plan: "build", group: "Intelligence" },
    { id: "marketing", label: t.marketing_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d='M22 12h-4l-3 9L9 3l-3 9H2'/></svg>", plan: "build", group: "Growth" },
    { id: "outreach", label: t.outreach_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d='M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z'/><polyline points='22,6 12,13 2,6'/></svg>", plan: "build", group: "Growth" },
    { id: "pricing", label: t.pricing_strategy_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><line x1='12' y1='1' x2='12' y2='23'/><path d='M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'/></svg>", plan: "build", group: "Growth" },
    { id: "revenue", label: t.revenue_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><polyline points='23 6 13.5 15.5 8.5 10.5 1 18'/><polyline points='17 6 23 6 23 12'/></svg>", plan: "build", group: "Growth" },
    { id: "cofounder", label: t.cofounder_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><rect x='3' y='11' width='18' height='11' rx='2'/><path d='M12 2a2 2 0 012 2v3H10V4a2 2 0 012-2z'/><circle cx='9' cy='16' r='1'/><circle cx='15' cy='16' r='1'/></svg>", plan: "scale", group: "AI" },
    { id: "notes", label: t.notes_title, icon: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d='M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7'/><path d='M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z'/></svg>", plan: "free", group: "Other" },
  ];

  const groups = ["Core", "Intelligence", "Growth", "AI", "Other"];

  const Paygate = ({ feature, plan }: { feature: string; plan: string }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, textAlign: "center", padding: "48px 32px" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: D ? "#1a1a1a" : "#f0f0f0", border: `1px solid ${th.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 24 }}>🔒</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: th.text, marginBottom: 8, letterSpacing: "-0.02em" }}>{feature}</div>
      <div style={{ fontSize: 15, color: th.textMuted, marginBottom: 6, lineHeight: 1.6 }}>
        {lang === "fr" ? <>Disponible avec le plan <strong style={{ color: th.text }}>{plan}</strong> et supérieur.</> : <>Available on the <strong style={{ color: th.text }}>{plan}</strong> plan and above.</>}
      </div>
      <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 32, lineHeight: 1.6, maxWidth: 400 }}>
        {lang === "fr" ? "Débloquez cette fonctionnalité pour accélérer votre croissance." : "Unlock this feature to accelerate your growth."}
      </div>
      <button type="button" onClick={() => void upgradeToNextPlan(userPlan)}
        style={{ background: "#111", color: "#fff", border: "none", borderRadius: 100, padding: "14px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em" }}>
        {lang === "fr" ? `Passer à ${plan} →` : `Upgrade to ${plan} →`}
      </button>
    </div>
  );

  const ReportDisplay = ({ report }: { report: string }) => (
    <div style={{ fontSize: 14, lineHeight: 1.8, color: th.text, whiteSpace: "pre-wrap", fontFamily: "'Inter', sans-serif" }}>
      {report.replace(/\*\*/g, "").replace(/^#+\s/gm, "").replace(/^\*\s/gm, "").replace(/^-\s/gm, "").trim()}
    </div>
  );

  if (!mounted) return <div style={{ background: "#0d0d0d", minHeight: "100vh" }} />;
  if (loading) return <div style={{ background: th.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: th.textMuted, fontFamily: "'Inter', sans-serif" }}>Loading...</div>;
  if (!project) return null;


  return (
    <div suppressHydrationWarning style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: th.bg, fontFamily: "'Inter', sans-serif", color: th.text }}>

      {/* TOP BAR — spans full width */}
      <div style={{ display: "flex", alignItems: "center", padding: "13px 20px", borderBottom: `1px solid ${th.sidebarBorder}`, background: th.sidebar, flexShrink: 0 }}>
        <img src="/images/navbarlogo.png" alt="Klayan" style={{ width: 40, height: 40, objectFit: "contain" }} />
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

      {/* SIDEBAR */}
      <aside suppressHydrationWarning style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${th.sidebarBorder}`, background: th.sidebar, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", boxSizing: "border-box" }}>

        {/* Top */}
        <div style={{ padding: "20px 20px 16px" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(project.status), flexShrink: 0 }} />
            <div style={{ fontSize: 12, fontWeight: 500, color: statusColor(project.status), textTransform: "capitalize", fontFamily: "'Europa Grotesk No 2 SH', 'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.01em" }}>
              {project.status === "building" ? t.building : project.status === "pivoting" ? t.pivoting : t.killed}
            </div>
          </div>
          <div style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: `<svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="folderBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a3a3a"/>
      <stop offset="100%" stop-color="#1a1a1a"/>
    </linearGradient>
    <linearGradient id="doc1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0f0f0"/>
      <stop offset="100%" stop-color="#d0d0d0"/>
    </linearGradient>
    <linearGradient id="doc2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8e8e8"/>
      <stop offset="100%" stop-color="#c8c8c8"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.5)"/>
    </filter>
  </defs>
  <!-- Folder body -->
  <rect x="4" y="20" width="64" height="46" rx="10" fill="url(#folderBg)" filter="url(#shadow)"/>
  <!-- Folder tab -->
  <path d="M4 28 Q4 20 12 20 L28 20 Q32 20 34 24 L38 30 H4 Z" fill="#2a2a2a"/>
  <!-- Doc back (right, rotated) -->
  <g transform="rotate(8, 36, 36)">
    <rect x="28" y="14" width="26" height="34" rx="4" fill="url(#doc1)" opacity="0.85"/>
    <rect x="32" y="22" width="14" height="2" rx="1" fill="#bbb"/>
    <rect x="32" y="27" width="10" height="2" rx="1" fill="#ccc"/>
    <rect x="32" y="32" width="12" height="2" rx="1" fill="#bbb"/>
  </g>
  <!-- Doc front (left, slightly rotated) -->
  <g transform="rotate(-5, 36, 36)">
    <rect x="18" y="12" width="26" height="34" rx="4" fill="url(#doc2)" opacity="0.95"/>
    <rect x="23" y="20" width="14" height="2" rx="1" fill="#aaa"/>
    <rect x="23" y="25" width="10" height="2" rx="1" fill="#bbb"/>
    <rect x="23" y="30" width="12" height="2" rx="1" fill="#aaa"/>
  </g>
  <!-- Folder front flap -->
  <path d="M4 38 Q4 66 14 66 H58 Q68 66 68 56 V38 Z" fill="url(#folderBg)" opacity="0.92"/>
  <!-- Shine on folder -->
  <path d="M4 38 Q4 44 36 44 Q68 44 68 38 Z" fill="rgba(255,255,255,0.06)"/>
</svg>` }} />
          <div style={{ fontSize: 20, fontWeight: 500, color: th.text, letterSpacing: "-0.02em", marginBottom: 12, fontFamily: "'Europa Grotesk No 2 SH', 'Plus Jakarta Sans', sans-serif" }}>
            Workspace
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: th.textMuted, textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: `1px solid ${th.cardBorder}`, background: th.cardBg }}>
              ← {lang === "fr" ? "Tableau de bord" : "Dashboard"}
            </Link>
            <Link href={`/verdict/${project.analysis_id}`} style={{ display: "inline-flex", alignItems: "center", fontSize: 12, color: th.textMuted, textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: `1px solid ${th.cardBorder}`, background: th.cardBg }}>
              {lang === "fr" ? "Verdict original" : "Original Verdict"}
            </Link>
          </div>
          {/* Search bar */}
          <div style={{ marginTop: 14, position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: th.textMuted, pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder={lang === "fr" ? "Rechercher..." : "Search..."}
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              style={{ width: "100%", background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 8, padding: "8px 10px 8px 30px", fontSize: 12, color: th.text, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box" as any }}
            />
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: "6px 12px", flex: 1 }}>
          {groups.map(group => {
            const items = navItems.filter(n => n.group === group && (sidebarSearch === "" || n.label.toLowerCase().includes(sidebarSearch.toLowerCase())));
            return (
              <div key={group} style={{ marginBottom: 8, display: items.length === 0 ? "none" : "block" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: th.textMuted, margin: "12px 0 4px 8px", textTransform: "uppercase" }}>{group}</div>
                {items.map(item => {
                  const locked = !canAccess(item.plan);
                  const active = activeTab === item.id;
                  return (
                    <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", marginBottom: 2, borderRadius: 8, border: "none", background: active ? th.activeNav : "transparent", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: active ? 600 : 400, color: locked ? th.textMuted : th.text, textAlign: "left", boxSizing: "border-box" }}>
                      <span style={{ opacity: locked ? 0.4 : 1, display: "flex", alignItems: "center" }} dangerouslySetInnerHTML={{ __html: item.icon }} />
                      <span style={{ flex: 1, opacity: locked ? 0.5 : 1 }}>{item.label}</span>
                      {locked && <span style={{ fontSize: 10, color: th.textMuted, background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{item.plan.toUpperCase()}</span>}
                      {!locked && (() => { const countMap: Record<string, number> = { checkin: checkins.length, milestones: milestones.filter(m => m.achieved_at).length, market: marketWatches.length, competitor: competitorReport ? 1 : 0, pivot: pivotReport ? 1 : 0, marketing: marketingReport ? 1 : 0, outreach: outreachReport ? 1 : 0, pricing: pricingReport ? 1 : 0, revenue: revenueReport ? 1 : 0, notes: notes.length, cofounder: chatMessages.filter(m => m.role === "assistant").length }; const count = countMap[item.id] ?? 0; return count > 0 ? <span style={{ fontSize: 11, color: th.textMuted, background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 6, padding: "1px 7px", fontWeight: 500, minWidth: 20, textAlign: "center" as any }}>{count}</span> : null; })()}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom — plan badge */}
        <div style={{ padding: "12px", borderTop: `1px solid ${th.sidebarBorder}` }}>
          <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: th.text, marginBottom: 2, textTransform: "capitalize" }}>{userPlan} {lang === "fr" ? "plan" : "plan"}</div>
            <div style={{ fontSize: 11, color: th.textMuted }}>{lang === "fr" ? "Votre plan actuel" : "Your current plan"}</div>
          </div>
          <button type="button"
            onClick={() => setShowResetConfirm(true)}
            style={{ width: "100%", background: "transparent", border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 500, color: "rgba(248,113,113,0.6)", cursor: "pointer", fontFamily: "'Inter', sans-serif", textAlign: "left" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.6)"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)"; e.currentTarget.style.color = "rgba(248,113,113,0.6)"; }}>
            {lang === "fr" ? "Réinitialiser le workspace" : "Reset workspace"}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main suppressHydrationWarning style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* Header */}
        <div style={{ padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: th.textMuted, fontWeight: 500, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
  {navItems.find(n => n.id === activeTab)?.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: th.text, letterSpacing: "-0.02em" }}>
                {project.idea_name.length > 60 ? project.idea_name.slice(0, 60) + "..." : project.idea_name}
              </div>
            </div>
            {/* Rename button — pixel perfect */}
            <button type="button"
              onClick={async () => {
                const newName = window.prompt(lang === "fr" ? "Renommer le projet :" : "Rename project:", project.idea_name);
                if (!newName || !newName.trim() || !supabase) return;
                const { error } = await supabase.from("projects").update({ idea_name: newName.trim() }).eq("id", project.id);
                if (!error) setProject((prev) => prev ? { ...prev, idea_name: newName.trim() } : prev);
              }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 100, border: "1.5px dashed #22c55e", background: "transparent", cursor: "pointer", fontFamily: "'Inter', sans-serif", color: "#22c55e", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: D ? "#1a1a1a" : "#f0fdf4", border: "1px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#22c55e", flexShrink: 0 }}>+</span>
              {lang === "fr" ? "Renommer" : "Add Name"}
            </button>
          </div>

        </div>

        {/* Separator */}
        <div style={{ height: 1, background: th.sidebarBorder, width: "100%" }} />

        {/* Content */}
        <div style={{ flex: 1, padding: "32px", maxWidth: 860, width: "100%", boxSizing: "border-box" }}>

          {/* CHECKIN TAB */}
          {activeTab === "checkin" && (
            canAccess("spark") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.checkin_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{lang === "fr" ? "Ton bilan hebdomadaire avec ton co-fondateur IA" : "Your weekly review with your AI co-founder"}</div>
                  <button type="button" onClick={() => setShowCheckin(!showCheckin)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: "pointer" }}>
                    {t.checkin_new}
                  </button>
                </div>

                {showCheckin && (
                  <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, padding: "24px", marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: th.text, marginBottom: 20 }}>{t.checkin_week}</div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 8 }}>{t.checkin_talked}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[true, false].map(val => (
                          <button key={String(val)} type="button" onClick={() => setCheckinForm(p => ({ ...p, talked_to_users: val }))}
                            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${checkinForm.talked_to_users === val ? th.text : th.cardBorder}`, background: checkinForm.talked_to_users === val ? th.text : "transparent", color: checkinForm.talked_to_users === val ? th.bg : th.textMuted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                            {val ? t.checkin_yes : t.checkin_no}
                          </button>
                        ))}
                      </div>
                    </div>
                    {checkinForm.talked_to_users && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 8 }}>{t.checkin_how_many}</div>
                        <input type="number" value={checkinForm.users_count} onChange={e => setCheckinForm(p => ({ ...p, users_count: Number(e.target.value) }))}
                          style={{ background: th.inputBg, border: `1px solid ${th.cardBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: th.text, width: 120, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box" as any }} />
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                      {[{ label: t.checkin_build_days, key: "build_days" }, { label: t.checkin_revenue, key: "revenue" }].map(({ label, key }) => (
                        <div key={key}>
                          <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 8 }}>{label}</div>
                          <input type="number" value={(checkinForm as any)[key]} onChange={e => setCheckinForm(p => ({ ...p, [key]: Number(e.target.value) }))}
                            style={{ background: th.inputBg, border: `1px solid ${th.cardBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: th.text, width: "100%", fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box" as any }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 8 }}>{t.checkin_what}</div>
                      <textarea value={checkinForm.notes} onChange={e => setCheckinForm(p => ({ ...p, notes: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitCheckin(); }}
                        placeholder={t.checkin_placeholder} rows={4}
                        style={{ background: th.inputBg, border: `1px solid ${th.cardBorder}`, borderRadius: 8, padding: "12px 14px", fontSize: 13, color: th.text, width: "100%", fontFamily: "'Inter', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box" as any }} />
                      <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4 }}>{t.checkin_hint}</div>
                    </div>
                    <button type="button" onClick={() => void submitCheckin()} disabled={submittingCheckin}
                      style={{ background: "#4ade80", color: "#000", border: "none", borderRadius: 100, padding: "12px 24px", fontSize: 13, fontWeight: 700, cursor: submittingCheckin ? "not-allowed" : "pointer", opacity: submittingCheckin ? 0.7 : 1, fontFamily: "'Inter', sans-serif" }}>
                      {submittingCheckin ? t.checkin_submitting : t.checkin_submit}
                    </button>
                  </div>
                )}

                {checkinReport && (
                  <div style={{ background: th.cardBg, border: `1px solid #4ade8033`, borderRadius: 12, padding: "24px", marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#4ade80", marginBottom: 16 }}>{t.checkin_report_title}</div>
                    <ReportDisplay report={checkinReport} />
                  </div>
                )}

                {checkins.length > 0 && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: th.text, marginBottom: 12 }}>{lang === "fr" ? "Historique" : "History"}</div>
                    {checkins.map(c => (
                      <div key={c.id} style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 10, padding: "16px 20px", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ fontSize: 12, color: th.textMuted }}>{new Date(c.created_at).toLocaleDateString()}</div>
                          <div style={{ display: "flex", gap: 12, fontSize: 12, color: th.textMuted }}>
                            <span>{lang === "fr" ? `${c.build_days}j de build` : `${c.build_days} build days`}</span>
                            <span>${c.revenue}</span>
                            {c.talked_to_users && <span style={{ color: "#4ade80" }}>✓ {lang === "fr" ? "parlé aux users" : "talked to users"}</span>}
                          </div>
                        </div>
                        {c.notes && <div style={{ fontSize: 13, color: th.text, lineHeight: 1.6 }}>{c.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.checkin_title} plan="Spark" />
          )}

          {/* MILESTONES TAB */}
          {activeTab === "milestones" && (
            <div>
              <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.milestones_title}</div>
              <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 24 }}>{lang === "fr" ? "Célèbre tes victoires et reçois un playbook IA" : "Celebrate wins and get an AI playbook"}</div>
              {[
                { type: "first_user", label: t.milestone_first_user, desc: t.milestone_first_user_desc, icon: "👤" },
                { type: "first_dollar", label: t.milestone_first_dollar, desc: t.milestone_first_dollar_desc, icon: "💵" },
                { type: "1k_mrr", label: t.milestone_1k, desc: t.milestone_1k_desc, icon: "🎯" },
                { type: "10k_mrr", label: t.milestone_10k, desc: t.milestone_10k_desc, icon: "🚀" },
              ].map(m => {
                const achieved = milestones.find(ms => ms.type === m.type);
                const claiming = claimingMilestone === m.type;
                return (
                  <div key={m.type} style={{ background: th.cardBg, border: `1px solid ${achieved ? "#4ade8033" : th.cardBorder}`, borderRadius: 12, padding: "20px 24px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 28 }}>{m.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: th.text, marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: 13, color: th.textMuted }}>{m.desc}</div>
                      {achieved?.playbook && (
                        <div style={{ marginTop: 12, fontSize: 13, color: th.text, lineHeight: 1.7, padding: "12px", background: D ? "#0d1a0d" : "#f0fdf0", borderRadius: 8 }}>
                          <ReportDisplay report={achieved.playbook} />
                        </div>
                      )}
                    </div>
                    {achieved ? (
                      <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 600, whiteSpace: "nowrap" }}>✓ {lang === "fr" ? "Atteint" : "Achieved"}</div>
                    ) : (
                      <button type="button" onClick={() => void claimMilestone(m.type)} disabled={claiming}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: claiming ? "not-allowed" : "pointer", opacity: claiming ? 0.6 : 1, whiteSpace: "nowrap" }}>
                        {claiming ? t.milestone_claiming : t.milestone_claim}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* MARKET WATCH TAB */}
          {activeTab === "market" && (
            canAccess("build") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.market_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{t.market_sub}</div>
                  <button type="button" onClick={() => void runMarketWatch()} disabled={runningMarketWatch}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: runningMarketWatch ? "not-allowed" : "pointer", opacity: runningMarketWatch ? 0.6 : 1 }}>
                    {runningMarketWatch ? (lang === "fr" ? "Analyse..." : "Scanning...") : (lang === "fr" ? "Lancer l'analyse →" : "Run scan →")}
                  </button>
                </div>
                {marketWatches.map((mw, i) => (
                  <div key={mw.id} style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, padding: "24px", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><div style={{ fontSize: 12, color: i === 0 ? "#4ade80" : th.textMuted, fontWeight: 600 }}>{i === 0 ? "● " : ""}{lang === "fr" ? "Rapport" : "Report"} · {new Date(mw.created_at).toLocaleDateString()}</div><div style={{ display: "flex", gap: 6, alignItems: "center" }}><button type="button" onClick={() => setCollapsedReports(p => ({ ...p, ["mw_" + mw.id]: !p["mw_" + mw.id] }))} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", fontSize: 11 }}>{collapsedReports["mw_" + mw.id] ? "▼" : "▲"}</button><button type="button" onClick={() => void deleteMarketWatch(mw.id)} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = th.textMuted}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div></div>{!collapsedReports["mw_" + mw.id] && <ReportDisplay report={mw.report} />}</div>
                ))}
                {marketWatches.length === 0 && !runningMarketWatch && (
                  <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>
                    {lang === "fr" ? "Lance ton premier scan de marché." : "Run your first market scan."}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.market_title} plan="Build" />
          )}

          {/* COMPETITOR TAB */}
          {activeTab === "competitor" && (
            canAccess("build") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.competitor_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{lang === "fr" ? "Analyse approfondie de tes concurrents" : "Deep competitor analysis"}</div>
                  <button type="button" onClick={() => void runCompetitorTracker()} disabled={runningCompetitor}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: runningCompetitor ? "not-allowed" : "pointer", opacity: runningCompetitor ? 0.6 : 1 }}>
                    {runningCompetitor ? (lang === "fr" ? "Analyse..." : "Analyzing...") : (lang === "fr" ? "Analyser →" : "Analyze →")}
                  </button>
                </div>
                {competitorReport ? (
                  <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: collapsedReports["competitor"] ? "none" : `1px solid ${th.cardBorder}`, cursor: "pointer" }} onClick={() => setCollapsedReports(p => ({ ...p, "competitor": !p["competitor"] }))}><div style={{ fontSize: 12, fontWeight: 600, color: th.textMuted }}>{lang === "fr" ? "Résultat" : "Output"}</div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" onClick={e => { e.stopPropagation(); void deleteReport("competitor"); }} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = th.textMuted}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button><span style={{ fontSize: 11, color: th.textMuted }}>{collapsedReports["competitor"] ? "▼" : "▲"}</span></div></div>{!collapsedReports["competitor"] && <div style={{ padding: "20px" }}><ReportDisplay report={competitorReport} /></div>}</div>
                ) : !runningCompetitor && (
                  <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>
                    {lang === "fr" ? "Lance une analyse de tes concurrents." : "Run a competitor analysis."}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.competitor_title} plan="Build" />
          )}

          {/* PIVOT RADAR TAB */}
          {activeTab === "pivot" && (
            canAccess("build") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.pivot_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{lang === "fr" ? "Détecte les signaux de pivot" : "Detect pivot signals"}</div>
                  <button type="button" onClick={() => void runPivotRadar()} disabled={runningPivot}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: runningPivot ? "not-allowed" : "pointer", opacity: runningPivot ? 0.6 : 1 }}>
                    {runningPivot ? (lang === "fr" ? "Analyse..." : "Analyzing...") : (lang === "fr" ? "Analyser →" : "Analyze →")}
                  </button>
                </div>
                {pivotReport ? (
                  <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: collapsedReports["pivot"] ? "none" : `1px solid ${th.cardBorder}`, cursor: "pointer" }} onClick={() => setCollapsedReports(p => ({ ...p, "pivot": !p["pivot"] }))}><div style={{ fontSize: 12, fontWeight: 600, color: th.textMuted }}>{lang === "fr" ? "Résultat" : "Output"}</div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" onClick={e => { e.stopPropagation(); void deleteReport("pivot"); }} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = th.textMuted}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button><span style={{ fontSize: 11, color: th.textMuted }}>{collapsedReports["pivot"] ? "▼" : "▲"}</span></div></div>{!collapsedReports["pivot"] && <div style={{ padding: "20px" }}><ReportDisplay report={pivotReport} /></div>}</div>
                ) : !runningPivot && (
                  <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>
                    {lang === "fr" ? "Lance le radar de pivot." : "Run the pivot radar."}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.pivot_title} plan="Build" />
          )}

          {/* MARKETING TAB */}
          {activeTab === "marketing" && (
            canAccess("build") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.marketing_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{lang === "fr" ? "Stratégie marketing IA personnalisée" : "AI-powered marketing strategy"}</div>
                  <button type="button" onClick={() => void runMarketingEngine()} disabled={runningMarketing}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: runningMarketing ? "not-allowed" : "pointer", opacity: runningMarketing ? 0.6 : 1 }}>
                    {runningMarketing ? (lang === "fr" ? "Génération..." : "Generating...") : (lang === "fr" ? "Générer →" : "Generate →")}
                  </button>
                </div>
                {marketingReport ? (
                  <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: collapsedReports["marketing"] ? "none" : `1px solid ${th.cardBorder}`, cursor: "pointer" }} onClick={() => setCollapsedReports(p => ({ ...p, "marketing": !p["marketing"] }))}><div style={{ fontSize: 12, fontWeight: 600, color: th.textMuted }}>{lang === "fr" ? "Résultat" : "Output"}</div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" onClick={e => { e.stopPropagation(); void deleteReport("marketing"); }} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = th.textMuted}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button><span style={{ fontSize: 11, color: th.textMuted }}>{collapsedReports["marketing"] ? "▼" : "▲"}</span></div></div>{!collapsedReports["marketing"] && <div style={{ padding: "20px" }}><ReportDisplay report={marketingReport} /></div>}</div>
                ) : !runningMarketing && (
                  <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>
                    {lang === "fr" ? "Lance le moteur marketing." : "Run the marketing engine."}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.marketing_title} plan="Build" />
          )}

          {/* OUTREACH TAB */}
          {activeTab === "outreach" && (
            canAccess("build") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.outreach_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{lang === "fr" ? "Messages de prospection personnalisés" : "Personalized outreach messages"}</div>
                  <button type="button" onClick={() => void runOutreachEngine()} disabled={runningOutreach}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: runningOutreach ? "not-allowed" : "pointer", opacity: runningOutreach ? 0.6 : 1 }}>
                    {runningOutreach ? (lang === "fr" ? "Génération..." : "Generating...") : (lang === "fr" ? "Générer →" : "Generate →")}
                  </button>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 8 }}>{lang === "fr" ? "Cible" : "Target"}</div>
                  <input value={outreachTarget} onChange={e => setOutreachTarget(e.target.value)}
                    style={{ background: th.inputBg, border: `1px solid ${th.cardBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: th.text, width: 300, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box" as any }} />
                </div>
                {outreachReport ? (
                  <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: collapsedReports["outreach"] ? "none" : `1px solid ${th.cardBorder}`, cursor: "pointer" }} onClick={() => setCollapsedReports(p => ({ ...p, "outreach": !p["outreach"] }))}><div style={{ fontSize: 12, fontWeight: 600, color: th.textMuted }}>{lang === "fr" ? "Résultat" : "Output"}</div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" onClick={e => { e.stopPropagation(); void deleteReport("outreach"); }} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = th.textMuted}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button><span style={{ fontSize: 11, color: th.textMuted }}>{collapsedReports["outreach"] ? "▼" : "▲"}</span></div></div>{!collapsedReports["outreach"] && <div style={{ padding: "20px" }}><ReportDisplay report={outreachReport} /></div>}</div>
                ) : !runningOutreach && (
                  <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>
                    {lang === "fr" ? "Lance le moteur de prospection." : "Run the outreach engine."}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.outreach_title} plan="Build" />
          )}

          {/* PRICING TAB */}
          {activeTab === "pricing" && (
            canAccess("build") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.pricing_strategy_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{lang === "fr" ? "Stratégie de prix optimale pour ton marché" : "Optimal pricing strategy for your market"}</div>
                  <button type="button" onClick={() => void runPricingStrategy()} disabled={runningPricing}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: runningPricing ? "not-allowed" : "pointer", opacity: runningPricing ? 0.6 : 1 }}>
                    {runningPricing ? (lang === "fr" ? "Génération..." : "Generating...") : (lang === "fr" ? "Générer →" : "Generate →")}
                  </button>
                </div>
                {pricingReport ? (
                  <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: collapsedReports["pricing"] ? "none" : `1px solid ${th.cardBorder}`, cursor: "pointer" }} onClick={() => setCollapsedReports(p => ({ ...p, "pricing": !p["pricing"] }))}><div style={{ fontSize: 12, fontWeight: 600, color: th.textMuted }}>{lang === "fr" ? "Résultat" : "Output"}</div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" onClick={e => { e.stopPropagation(); void deleteReport("pricing"); }} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = th.textMuted}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button><span style={{ fontSize: 11, color: th.textMuted }}>{collapsedReports["pricing"] ? "▼" : "▲"}</span></div></div>{!collapsedReports["pricing"] && <div style={{ padding: "20px" }}><ReportDisplay report={pricingReport} /></div>}</div>
                ) : !runningPricing && (
                  <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>
                    {lang === "fr" ? "Lance la stratégie de prix." : "Run the pricing strategy."}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.pricing_strategy_title} plan="Build" />
          )}

          {/* REVENUE TAB */}
          {activeTab === "revenue" && (
            canAccess("build") ? (
              <div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.revenue_title}</div>
                  <div style={{ fontSize: 14, color: th.textMuted, marginBottom: 16 }}>{lang === "fr" ? "Roadmap vers ton premier $10K MRR" : "Roadmap to your first $10K MRR"}</div>
                  <button type="button" onClick={() => void runRevenueRoadmap()} disabled={runningRevenue}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: D ? "#fff" : "#f5f5f5", color: "#000", border: "none", borderRadius: 100, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", boxShadow: "0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)", letterSpacing: "-0.01em", cursor: runningRevenue ? "not-allowed" : "pointer", opacity: runningRevenue ? 0.6 : 1 }}>
                    {runningRevenue ? (lang === "fr" ? "Génération..." : "Generating...") : (lang === "fr" ? "Générer →" : "Generate →")}
                  </button>
                </div>
                {revenueReport ? (
                  <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: collapsedReports["revenue"] ? "none" : `1px solid ${th.cardBorder}`, cursor: "pointer" }} onClick={() => setCollapsedReports(p => ({ ...p, "revenue": !p["revenue"] }))}><div style={{ fontSize: 12, fontWeight: 600, color: th.textMuted }}>{lang === "fr" ? "Résultat" : "Output"}</div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" onClick={e => { e.stopPropagation(); void deleteReport("revenue"); }} style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = th.textMuted}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button><span style={{ fontSize: 11, color: th.textMuted }}>{collapsedReports["revenue"] ? "▼" : "▲"}</span></div></div>{!collapsedReports["revenue"] && <div style={{ padding: "20px" }}><ReportDisplay report={revenueReport} /></div>}</div>
                ) : !runningRevenue && (
                  <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>
                    {lang === "fr" ? "Lance ta roadmap revenus." : "Run your revenue roadmap."}
                  </div>
                )}
              </div>
            ) : <Paygate feature={t.revenue_title} plan="Build" />
          )}

          {/* COFOUNDER TAB */}
          {activeTab === "cofounder" && (
            canAccess("scale") ? (
              <div>
                <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.cofounder_title}</div>
                <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 24 }}>{lang === "fr" ? "Ton co-fondateur IA avec accès au web en temps réel" : "Your AI co-founder with real-time web access"}</div>
                <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "20px 24px", minHeight: 300, maxHeight: 500, overflowY: "auto" }}>
                    {chatMessages.length === 0 && (
                      <div style={{ textAlign: "center", padding: "48px 0", color: th.textMuted, fontSize: 14 }}>
                        {lang === "fr" ? "Pose une question à ton co-fondateur IA..." : "Ask your AI co-founder anything..."}
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} style={{ marginBottom: 16, display: "flex", gap: 12, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{ maxWidth: "80%", background: msg.role === "user" ? th.text : D ? "#1e1e1e" : "#f0f0f0", color: msg.role === "user" ? th.bg : th.text, borderRadius: 12, padding: "10px 14px", fontSize: 13, lineHeight: 1.6 }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: `1px solid ${th.cardBorder}`, padding: "16px 24px", display: "flex", gap: 12 }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) void sendCofounderMessage(); }}
                      placeholder={lang === "fr" ? "Demande quelque chose..." : "Ask something..."}
                      style={{ flex: 1, background: th.inputBg, border: `1px solid ${th.cardBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: th.text, fontFamily: "'Inter', sans-serif", outline: "none" }} />
                    <button type="button" onClick={() => void sendCofounderMessage()} disabled={chatLoading || !chatInput.trim()}
                      style={{ background: th.text, color: th.bg, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif", opacity: chatLoading || !chatInput.trim() ? 0.5 : 1 }}>
                      {chatLoading ? "..." : "→"}
                    </button>
                  </div>
                </div>
              </div>
            ) : <Paygate feature={t.cofounder_title} plan="Scale" />
          )}

          {/* NOTES TAB */}
          {activeTab === "notes" && (
            <div>
              <div style={{ fontSize: 26, fontWeight: 600, color: th.text, marginBottom: 6, fontFamily: "'Neue Haas Grotesk Display Pro', 'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>{t.notes_title}</div>
              <div style={{ fontSize: 13, color: th.textMuted, marginBottom: 24 }}>{lang === "fr" ? "Tes notes privées pour ce projet" : "Your private notes for this project"}</div>
              <div style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 12, padding: "20px", marginBottom: 16 }}>
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addNote(); }}
                  placeholder={lang === "fr" ? "Nouvelle note... (⌘ + Entrée pour sauvegarder)" : "New note... (⌘ + Enter to save)"}
                  rows={3}
                  style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: th.text, width: "100%", fontFamily: "'Inter', sans-serif", resize: "none", boxSizing: "border-box" as any }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button type="button" onClick={() => void addNote()} disabled={savingNote || !newNote.trim()}
                    style={{ background: th.text, color: th.bg, border: "none", borderRadius: 100, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: savingNote || !newNote.trim() ? 0.5 : 1, fontFamily: "'Inter', sans-serif" }}>
                    {savingNote ? "..." : (lang === "fr" ? "Sauvegarder" : "Save")}
                  </button>
                </div>
              </div>
              {notes.map(note => (
                <div key={note.id} style={{ background: th.cardBg, border: `1px solid ${th.cardBorder}`, borderRadius: 10, padding: "16px 20px", marginBottom: 10, display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, fontSize: 13, color: th.text, lineHeight: 1.6 }}>{note.content}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: th.textMuted }}>{new Date(note.created_at).toLocaleDateString()}</div>
                    <button type="button" onClick={() => void deleteNote(note.id)}
                      style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", fontSize: 16, padding: "2px 6px" }}>×</button>
                  </div>
                </div>
              ))}
              {notes.length === 0 && <div style={{ textAlign: "center", padding: "48px", color: th.textMuted, fontSize: 14 }}>{lang === "fr" ? "Aucune note pour l'instant." : "No notes yet."}</div>}
            </div>
          )}

        </div>
      </main>
      </div>
    </div>
  );
}
