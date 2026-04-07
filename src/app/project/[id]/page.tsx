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
  window.location.href = `/pricing?plan=${targetPlan}`;
}

function LockedFeature({ feature, requiredPlan, userPlan }: { feature: string; requiredPlan: string; userPlan: string }) {
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
        Available on the <strong style={{ color: "#fff" }}>{requiredPlan}</strong> plan and above.
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 24, lineHeight: 1.6 }}>
        {userPlan === "free" ? "Upgrade to unlock your full workspace." : `Upgrade from ${userPlan} to unlock this feature.`}
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
        {loading ? "Redirecting..." : `Upgrade to ${requiredPlan} →`}
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

  if (loading) {
    return (
      <div style={{ background: "#000", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>{t.loading}</div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
            {t.back}
          </Link>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
          <img src="/images/navbarlogo.png" alt="Klayan" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(["building", "pivoting", "killed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void updateStatus(s)}
              style={{
                background: project.status === s ? "rgba(255,255,255,0.1)" : "transparent",
                border: `1px solid ${project.status === s ? statusColor(s) : "rgba(255,255,255,0.1)"}`,
                borderRadius: 100,
                padding: "6px 14px",
                color: project.status === s ? statusColor(s) : "rgba(255,255,255,0.3)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
                letterSpacing: "-0.01em",
              }}
            >
              {s === "building" ? t.building : s === "pivoting" ? t.pivoting : t.killed}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            style={{
              background: "transparent",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 100,
              padding: "6px 14px",
              color: "rgba(248,113,113,0.5)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "-0.01em",
              marginLeft: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.6)"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)"; e.currentTarget.style.color = "rgba(248,113,113,0.5)"; }}
          >
            Reset workspace
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 32px" }}>

        {/* Project Title */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            {t.active_project}
          </div>
          <EditableTitle
            lang={lang}
            value={project.idea_name}
            onSave={async (newName) => {
              if (!supabase) return;
              const { error } = await supabase.from("projects").update({ idea_name: newName }).eq("id", project.id);
              console.log("Rename result:", error);
              if (!error) setProject((prev) => prev ? { ...prev, idea_name: newName } : prev);
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(project.status) }} />
              <span style={{ fontSize: 13, color: statusColor(project.status), fontWeight: 600, textTransform: "capitalize" }}>
                {project.status === "building" ? t.building : project.status === "pivoting" ? t.pivoting : project.status === "killed" ? t.killed : project.status}
              </span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>·</span>
            <Link href={`/verdict/${project.analysis_id}`} style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
              {t.view_verdict}
            </Link>
          </div>
        </div>

        {userPlan === "free" ? (
          <LockedFeature feature={t.checkin_title} requiredPlan="Spark" userPlan={userPlan} />
        ) : (
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.checkin_title}</div>
            <button
              type="button"
              onClick={() => setShowCheckin(!showCheckin)}
              style={{
                background: "#ffffff",
                color: "#000",
                border: "none",
                borderRadius: 100,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.checkin_new}
            </button>
          </div>

          {showCheckin ? (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, color: "rgba(255,255,255,0.7)" }}>
                {t.checkin_week}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{t.checkin_talked}</label>
                  <button
                    type="button"
                    onClick={() => setCheckinForm(f => ({ ...f, talked_to_users: !f.talked_to_users }))}
                    style={{
                      background: checkinForm.talked_to_users ? "#4ade80" : "rgba(255,255,255,0.1)",
                      color: checkinForm.talked_to_users ? "#000" : "#fff",
                      border: "none",
                      borderRadius: 100,
                      padding: "6px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {checkinForm.talked_to_users ? t.checkin_yes : t.checkin_no}
                  </button>
                </div>

                {checkinForm.talked_to_users ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>{t.checkin_how_many}</label>
                    <input
                      type="number"
                      min={0}
                      value={checkinForm.users_count}
                      onChange={(e) => setCheckinForm(f => ({ ...f, users_count: Number(e.target.value) }))}
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 12px", color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, width: 80 }}
                    />
                  </div>
                ) : null}

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>{t.checkin_build_days}</label>
                  <input
                    type="number"
                    min={0}
                    max={7}
                    value={checkinForm.build_days}
                    onChange={(e) => setCheckinForm(f => ({ ...f, build_days: Number(e.target.value) }))}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 12px", color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, width: 80 }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>{t.checkin_revenue}</label>
                  <input
                    type="number"
                    min={0}
                    value={checkinForm.revenue}
                    onChange={(e) => setCheckinForm(f => ({ ...f, revenue: Number(e.target.value) }))}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 12px", color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, width: 120 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 8 }}>{t.checkin_what}</label>
                  <textarea
                    value={checkinForm.notes}
                    onChange={(e) => setCheckinForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder={t.checkin_placeholder}
                    rows={3}
                    style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void submitCheckin()}
                  disabled={submittingCheckin}
                  style={{ background: "#ffffff", color: "#000", border: "none", borderRadius: 100, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: submittingCheckin ? 0.6 : 1 }}
                >
                  {submittingCheckin ? t.checkin_submitting : t.checkin_submit}
                </button>
              </div>
            </div>
          ) : null}

          {checkinReport ? (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#4ade80" }}>{t.checkin_report_title}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <CheckinReportToggle lang={lang} report={checkinReport} />
                <button
                  type="button"
                  onClick={() => void deleteReport("checkin_report")}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}

          {checkins.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checkins.map((c) => (
                <div key={c.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>
                      {new Date(c.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span style={{ fontSize: 12, color: c.revenue > 0 ? "#4ade80" : "rgba(255,255,255,0.3)" }}>
                      {c.revenue > 0 ? `$${c.revenue} ${t.checkin_row_revenue}` : t.checkin_row_no_revenue}
                    </span>
                  </div>
                  {c.ai_report ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <CheckinReportToggle lang={lang} report={c.ai_report} />
                      <button
                        type="button"
                        onClick={() => void clearCheckinRowAiReport(c.id)}
                        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        )}

        {/* Milestone Engine */}
        {userPlan === "free" || userPlan === "spark" ? (
          <LockedFeature feature={t.locked_milestone_feature} requiredPlan="Build" userPlan={userPlan} />
        ) : (
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20 }}>
            {t.milestones_title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { type: "first_user", label: t.milestone_first_user, icon: "👤", desc: t.milestone_first_user_desc },
              { type: "first_dollar", label: t.milestone_first_dollar, icon: "💵", desc: t.milestone_first_dollar_desc },
              { type: "1k_mrr", label: t.milestone_1k, icon: "🚀", desc: t.milestone_1k_desc },
              { type: "10k_mrr", label: t.milestone_10k, icon: "🔥", desc: t.milestone_10k_desc },
            ].map((m, idx) => {
              const achieved = milestones.find((ms) => ms.type === m.type);
              const prevType = ["first_user", "first_dollar", "1k_mrr", "10k_mrr"][idx - 1];
              const prevAchieved = idx === 0 || milestones.find((ms) => ms.type === prevType);
              const isLocked = !prevAchieved && !achieved;

              return (
                <div key={m.type} style={{
                  background: achieved ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${achieved ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 14,
                  padding: "16px 20px",
                  opacity: isLocked ? 0.4 : 1,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: achieved ? "#4ade80" : isLocked ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.4)",
                        flexShrink: 0,
                        marginTop: 4,
                      }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{m.desc}</div>
                      </div>
                    </div>
                    {!achieved && !isLocked ? (
                      <button
                        type="button"
                        onClick={() => void claimMilestone(m.type)}
                        disabled={claimingMilestone === m.type}
                        style={{
                          background: "#ffffff",
                          color: "#000",
                          border: "none",
                          borderRadius: 100,
                          padding: "8px 18px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          opacity: claimingMilestone === m.type ? 0.6 : 1,
                        }}
                      >
                        {claimingMilestone === m.type ? t.milestone_claiming : t.milestone_claim}
                      </button>
                    ) : achieved ? (
                      <span style={{ fontSize: 12, color: "rgba(74,222,128,0.7)" }}>
                        {new Date(achieved.achieved_at!).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric" })}
                      </span>
                    ) : null}
                  </div>
                  {achieved?.playbook ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 12 }}>
                      <PlaybookToggle lang={lang} playbook={achieved.playbook} />
                      <button
                        type="button"
                        onClick={() => void clearMilestonePlaybook(achieved.id)}
                        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Market Watch */}
        {userPlan === "free" || userPlan === "spark" ? (
          <LockedFeature feature={t.market_title} requiredPlan="Build" userPlan={userPlan} />
        ) : (
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.market_title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.market_sub}</div>
            </div>
            <button
              type="button"
              onClick={() => void runMarketWatch()}
              disabled={runningMarketWatch}
              style={{
                background: runningMarketWatch ? "rgba(255,255,255,0.1)" : "#ffffff",
                color: runningMarketWatch ? "rgba(255,255,255,0.5)" : "#000",
                border: "none",
                borderRadius: 100,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: runningMarketWatch ? "not-allowed" : "pointer",
              }}
            >
              {runningMarketWatch ? t.market_running : t.market_run}
            </button>
          </div>

          {marketWatches.length === 0 ? (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "32px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>👁️</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.market_empty}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{t.market_empty_sub}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {marketWatches.map((mw) => (
                <div key={mw.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
                    {new Date(mw.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <MarketWatchToggle lang={lang} report={mw.report} />
                    <button
                      type="button"
                      onClick={() => void deleteMarketWatch(mw.id)}
                      style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Co-Founder Mode */}
        {userPlan !== "scale" ? (
          <LockedFeature feature={t.cofounder_title} requiredPlan="Scale" userPlan={userPlan} />
        ) : (
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.cofounder_title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.cofounder_sub}</div>
            </div>
            <button
              type="button"
              onClick={() => setShowCofounder(!showCofounder)}
              style={{
                background: showCofounder ? "rgba(255,255,255,0.1)" : "#ffffff",
                color: showCofounder ? "#fff" : "#000",
                border: "none",
                borderRadius: 100,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {showCofounder ? t.cofounder_close : t.cofounder_open}
            </button>
          </div>

          {showCofounder ? (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
              {/* Messages */}
              <div style={{ padding: "20px", maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                {chatMessages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    {t.cofounder_empty}
                  </div>
                ) : chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}>
                    <div style={{
                      maxWidth: "80%",
                      background: msg.role === "user" ? "#ffffff" : "rgba(255,255,255,0.06)",
                      color: msg.role === "user" ? "#000" : "rgba(255,255,255,0.85)",
                      borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      padding: "12px 16px",
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading ? (
                  <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 8 }}>
                    <img
                      src="/images/navbarlogo.png"
                      alt="Klayan"
                      style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "16px 16px 16px 4px", padding: "12px 16px", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                      {t.cofounder_thinking}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Input */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px", display: "flex", gap: 12 }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void sendMessage(); }}
                  placeholder={t.cofounder_placeholder}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    background: "#ffffff",
                    color: "#000",
                    border: "none",
                    borderRadius: 100,
                    padding: "8px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  {t.cofounder_send}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        )}

        {/* Pivot Radar */}
        {userPlan === "free" || userPlan === "spark" ? (
          <LockedFeature feature={t.pivot_title} requiredPlan="Build" userPlan={userPlan} />
        ) : (
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.pivot_title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.pivot_sub}</div>
            </div>
            <button
              type="button"
              onClick={() => void runPivotRadar()}
              disabled={runningPivot}
              style={{
                background: runningPivot ? "rgba(255,255,255,0.1)" : "#ffffff",
                color: runningPivot ? "rgba(255,255,255,0.5)" : "#000",
                border: "none",
                borderRadius: 100,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: runningPivot ? "not-allowed" : "pointer",
              }}
            >
              {runningPivot ? t.pivot_running : t.pivot_run}
            </button>
          </div>

          {!pivotReport ? (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "32px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.pivot_empty}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{t.pivot_empty_sub}</div>
            </div>
          ) : (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <PivotReportToggle lang={lang} report={pivotReport} />
                <button
                  type="button"
                  onClick={() => void deleteReport("pivot")}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Marketing Engine */}
        {userPlan === "free" || userPlan === "spark" ? (
          <LockedFeature feature={t.marketing_title} requiredPlan="Build" userPlan={userPlan} />
        ) : (
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.marketing_title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.marketing_sub}</div>
              </div>
              <button
                type="button"
                onClick={() => void runMarketingEngine()}
                disabled={runningMarketing}
                style={{
                  background: runningMarketing ? "rgba(255,255,255,0.1)" : "#ffffff",
                  color: runningMarketing ? "rgba(255,255,255,0.5)" : "#000",
                  border: "none",
                  borderRadius: 100,
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: runningMarketing ? "not-allowed" : "pointer",
                }}
              >
                {runningMarketing ? t.marketing_running : t.marketing_run}
              </button>
            </div>

            {!marketingReport ? (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "32px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>📣</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.marketing_empty}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{t.marketing_empty_sub}</div>
              </div>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <MarketingReportToggle report={marketingReport} />
                  <button
                    type="button"
                    onClick={() => void deleteReport("marketing")}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Outreach Engine */}
        {userPlan === "free" || userPlan === "spark" ? (
          <LockedFeature feature={t.outreach_title} requiredPlan="Build" userPlan={userPlan} />
        ) : (
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.outreach_title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.outreach_sub}</div>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>{t.outreach_target_label}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {["Potential customer", "Potential partner", "Potential advisor", "Potential investor"].map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setOutreachTarget(target)}
                    style={{
                      background: outreachTarget === target ? "#ffffff" : "rgba(255,255,255,0.06)",
                      color: outreachTarget === target ? "#000" : "rgba(255,255,255,0.6)",
                      border: `1px solid ${outreachTarget === target ? "#ffffff" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 100,
                      padding: "6px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {target}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void runOutreachEngine()}
                disabled={runningOutreach}
                style={{
                  background: runningOutreach ? "rgba(255,255,255,0.1)" : "#ffffff",
                  color: runningOutreach ? "rgba(255,255,255,0.5)" : "#000",
                  border: "none",
                  borderRadius: 100,
                  padding: "10px 24px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: runningOutreach ? "not-allowed" : "pointer",
                  width: "100%",
                }}
              >
                {runningOutreach ? t.outreach_running : t.outreach_run}
              </button>
            </div>

            {!outreachReport ? (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "32px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>✉️</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.outreach_empty}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{t.outreach_empty_sub}</div>
              </div>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <OutreachToggle report={outreachReport} />
                  <button
                    type="button"
                    onClick={() => void deleteReport("outreach")}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Competitor Tracker */}
        {userPlan === "free" || userPlan === "spark" ? (
          <LockedFeature feature={t.competitor_title} requiredPlan="Build" userPlan={userPlan} />
        ) : (
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.competitor_title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.competitor_sub}</div>
              </div>
              <button
                type="button"
                onClick={() => void runCompetitorTracker()}
                disabled={runningCompetitor}
                style={{
                  background: runningCompetitor ? "rgba(255,255,255,0.1)" : "#ffffff",
                  color: runningCompetitor ? "rgba(255,255,255,0.5)" : "#000",
                  border: "none",
                  borderRadius: 100,
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: runningCompetitor ? "not-allowed" : "pointer",
                }}
              >
                {runningCompetitor ? t.competitor_running : t.competitor_run}
              </button>
            </div>

            {!competitorReport ? (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "32px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.competitor_empty}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{t.competitor_empty_sub}</div>
              </div>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <CompetitorToggle report={competitorReport} />
                  <button
                    type="button"
                    onClick={() => void deleteReport("competitor")}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pricing Strategy */}
        {userPlan === "free" || userPlan === "spark" ? (
          <LockedFeature feature={t.pricing_strategy_title} requiredPlan="Build" userPlan={userPlan} />
        ) : (
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.pricing_strategy_title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.pricing_strategy_sub}</div>
              </div>
              <button
                type="button"
                onClick={() => void runPricingStrategy()}
                disabled={runningPricing}
                style={{
                  background: runningPricing ? "rgba(255,255,255,0.1)" : "#ffffff",
                  color: runningPricing ? "rgba(255,255,255,0.5)" : "#000",
                  border: "none",
                  borderRadius: 100,
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: runningPricing ? "not-allowed" : "pointer",
                }}
              >
                {runningPricing ? t.pricing_strategy_running : t.pricing_strategy_run}
              </button>
            </div>

            {!pricingReport ? (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "32px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>💰</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.pricing_strategy_empty}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{t.pricing_strategy_empty_sub}</div>
              </div>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <PricingToggle report={pricingReport} />
                  <button
                    type="button"
                    onClick={() => void deleteReport("pricing")}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Revenue Roadmap */}
        {userPlan !== "scale" ? (
          <LockedFeature feature={t.revenue_title} requiredPlan="Scale" userPlan={userPlan} />
        ) : (
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.revenue_title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{t.revenue_sub}</div>
              </div>
              <button
                type="button"
                onClick={() => void runRevenueRoadmap()}
                disabled={runningRevenue}
                style={{
                  background: runningRevenue ? "rgba(255,255,255,0.1)" : "#ffffff",
                  color: runningRevenue ? "rgba(255,255,255,0.5)" : "#000",
                  border: "none",
                  borderRadius: 100,
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: runningRevenue ? "not-allowed" : "pointer",
                }}
              >
                {runningRevenue ? t.revenue_running : t.revenue_run}
              </button>
            </div>

            {!revenueReport ? (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "32px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>📈</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.revenue_empty}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>{t.revenue_empty_sub}</div>
              </div>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <RevenueToggle report={revenueReport} />
                  <button
                    type="button"
                    onClick={() => void deleteReport("revenue")}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notes Section */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20 }}>
            {t.notes_title}
          </div>

          {/* Add Note */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder={t.notes_placeholder}
              rows={3}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 300,
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
                lineHeight: 1.6,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) void addNote();
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{t.notes_hint}</span>
              <button
                type="button"
                onClick={() => void addNote()}
                disabled={savingNote || !newNote.trim()}
                style={{
                  background: "#ffffff",
                  color: "#000",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: savingNote || !newNote.trim() ? 0.4 : 1,
                }}
              >
                {savingNote ? t.notes_saving : t.notes_save}
              </button>
            </div>
          </div>

          {/* Notes List */}
          {notes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
              {t.notes_empty}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {notes.map((note) => (
                <div key={note.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", whiteSpace: "pre-wrap", marginBottom: 12 }}>
                    {note.content}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
                      {new Date(note.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      type="button"
                      onClick={() => void deleteNote(note.id)}
                      style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 12, padding: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                    >
                      {t.notes_delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showResetConfirm ? (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(8px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
        onClick={() => setShowResetConfirm(false)}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 16,
              padding: 32,
              width: "100%",
              maxWidth: 400,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Reset workspace?</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 24, lineHeight: 1.6 }}>
              This will permanently delete all check-ins, milestones, notes, market watches and reports for this project. The project itself will remain.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 20px", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resetWorkspace()}
                disabled={resetting}
                style={{ background: "#f87171", color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1, opacity: resetting ? 0.6 : 1 }}
              >
                {resetting ? "Resetting..." : "Yes, reset everything"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
