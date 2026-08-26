"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

export type InfoKind = "rules" | "howto" | "pricing";

async function sessionAuthHeaders(): Promise<HeadersInit> {
  if (!supabase) return {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function kindLabel(kind: InfoKind, fr: boolean) {
  if (kind === "howto") return fr ? "Comment ça marche" : "How it works";
  if (kind === "pricing") return fr ? "Modèle de pricing" : "Pricing model";
  return fr ? "Règles" : "Rules";
}

function kindHint(kind: InfoKind, fr: boolean) {
  if (kind === "howto") {
    return fr
      ? "Expliquez le fonctionnement — visible en lecture seule sur tous les dashboards créateurs."
      : "Explain how it works — shown read-only on every creator dashboard.";
  }
  if (kind === "pricing") {
    return fr
      ? "Décrivez votre modèle de rémunération — visible en lecture seule pour vos créateurs."
      : "Describe your pricing / payout model — shown read-only to your creators.";
  }
  return fr
    ? "Ces règles apparaissent en lecture seule dans le dashboard de vos créateurs."
    : "These rules appear read-only in your creators’ dashboards.";
}

function kindPlaceholder(kind: InfoKind, fr: boolean) {
  if (kind === "howto") {
    return fr
      ? "Ex. 1. Rejoignez la campagne.\n2. Publiez votre contenu.\n3. Suivez vos stats dans Tracking…"
      : "e.g. 1. Join the campaign.\n2. Post your content.\n3. Track stats in Tracking…";
  }
  if (kind === "pricing") {
    return fr
      ? "Ex. Commission 15% sur les ventes.\nOu RPM : 1 € / 1 000 vues, 30% pour le créateur…"
      : "e.g. 15% commission on sales.\nOr RPM: €1 / 1,000 views, 30% to the creator…";
  }
  return fr
    ? "Ex. Pas de contenu politique.\nToujours mentionner le code promo.\nRépondre aux commentaires sous 24h…"
    : "e.g. No political content.\nAlways mention the promo code.\nReply to comments within 24h…";
}

export function InfosView({
  userId,
  isMobile,
  isCreator,
  section = "rules",
}: {
  userId?: string;
  isMobile?: boolean;
  isCreator?: boolean;
  section?: InfoKind;
}) {
  if (isCreator) {
    return <CreatorInfosView userId={userId} isMobile={isMobile} section={section} />;
  }
  return <BrandInfosView userId={userId} isMobile={isMobile} />;
}

/** @deprecated use InfosView */
export function RulesView(props: {
  userId?: string;
  isMobile?: boolean;
  isCreator?: boolean;
}) {
  return <InfosView {...props} section="rules" />;
}

const pagePad = (isMobile?: boolean) => (isMobile ? "20px 16px 48px" : "28px 28px 56px");

function BrandInfosView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const [kind, setKind] = useState<InfoKind>("rules");
  const [body, setBody] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(
    async (activeKind: InfoKind) => {
      if (!userId) {
        setBody("");
        setSavedBody("");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const authHeaders = await sessionAuthHeaders();
        const res = await fetch(
          `/api/infos?brandId=${encodeURIComponent(userId)}&kind=${encodeURIComponent(activeKind)}`,
          { credentials: "include", cache: "no-store", headers: authHeaders },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || (fr ? "Chargement impossible" : "Could not load"));
          return;
        }
        const text = String(data.info?.body || "");
        setBody(text);
        setSavedBody(text);
        setSavedAt(data.info?.updated_at || null);
      } catch {
        setError(fr ? "Erreur réseau" : "Network error");
      } finally {
        setLoading(false);
      }
    },
    [userId, fr],
  );

  useEffect(() => {
    void load(kind);
  }, [load, kind]);

  const dirty = body !== savedBody;

  const save = async () => {
    if (!userId || saving || !dirty) return;
    setSaving(true);
    setError("");
    try {
      const authHeaders = await sessionAuthHeaders();
      const res = await fetch("/api/infos", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ brandId: userId, kind, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Enregistrement impossible" : "Could not save"));
        return;
      }
      const text = String(data.info?.body || body);
      setBody(text);
      setSavedBody(text);
      setSavedAt(data.info?.updated_at || new Date().toISOString());
      window.dispatchEvent(new Event("trackit:infos-updated"));
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setSaving(false);
    }
  };

  const onKindChange = (next: InfoKind) => {
    if (next === kind) return;
    if (dirty && !window.confirm(fr ? "Modifications non enregistrées — continuer ?" : "Unsaved changes — continue?")) {
      return;
    }
    setKind(next);
  };

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-bg)", color: "var(--ws-text)", padding: pagePad(isMobile) }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 600, margin: 0, letterSpacing: "-0.03em" }}>
              {fr ? "Informations" : "Information"}
            </h1>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ws-text-muted)", letterSpacing: "-0.02em" }}>
              {fr
                ? "Choisissez une section à éditer — elle s’affiche chez tous vos créateurs."
                : "Pick a section to edit — it shows on every creator dashboard."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving || loading}
            style={{
              ...primaryBtn,
              opacity: !dirty || saving || loading ? 0.45 : 1,
              cursor: !dirty || saving || loading ? "default" : "pointer",
            }}
          >
            {saving ? "…" : fr ? "Enregistrer" : "Save"}
          </button>
        </div>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.02em" }}>
            {fr ? "Section" : "Section"}
          </span>
          <select
            value={kind}
            onChange={(e) => onKindChange(e.target.value as InfoKind)}
            style={{
              width: "100%",
              maxWidth: 360,
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--ws-border)",
              fontSize: 15,
              fontFamily: "inherit",
              color: "var(--ws-text)",
              background: "var(--ws-input)",
              letterSpacing: "-0.02em",
            }}
          >
            <option value="rules">{kindLabel("rules", fr)}</option>
            <option value="howto">{kindLabel("howto", fr)}</option>
            <option value="pricing">{kindLabel("pricing", fr)}</option>
          </select>
        </label>

        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--ws-text-muted)", letterSpacing: "-0.02em" }}>
          {kindHint(kind, fr)}
        </p>

        {error ? <p style={{ color: "#f97316", fontSize: 13.5, margin: "0 0 12px" }}>{error}</p> : null}

        {loading ? (
          <p style={{ color: "var(--ws-text-muted)", fontSize: 14 }}>{fr ? "Chargement…" : "Loading…"}</p>
        ) : (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kindPlaceholder(kind, fr)}
              rows={18}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "18px 20px",
                borderRadius: 14,
                border: "1px solid var(--ws-border)",
                fontSize: 15,
                fontFamily: "inherit",
                lineHeight: 1.55,
                letterSpacing: "-0.02em",
                color: "var(--ws-text)",
                background: "var(--ws-input)",
                outline: "none",
                resize: "vertical",
                minHeight: 320,
              }}
            />
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ws-text-muted)" }}>
              {dirty
                ? fr
                  ? "Modifications non enregistrées"
                  : "Unsaved changes"
                : savedAt
                  ? fr
                    ? `Dernière mise à jour · ${new Date(savedAt).toLocaleString("fr-FR")}`
                    : `Last updated · ${new Date(savedAt).toLocaleString()}`
                  : fr
                    ? "Aucun contenu pour l’instant"
                    : "No content yet"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

type CreatorInfoRow = {
  brandId: string;
  brandName: string;
  body: string;
  updatedAt: string | null;
};

function CreatorInfosView({
  userId,
  isMobile,
  section,
}: {
  userId?: string;
  isMobile?: boolean;
  section: InfoKind;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const [items, setItems] = useState<CreatorInfoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const authHeaders = await sessionAuthHeaders();
      const res = await fetch(
        `/api/creator/infos?userId=${encodeURIComponent(userId)}&kind=${encodeURIComponent(section)}`,
        { credentials: "include", cache: "no-store", headers: authHeaders },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Chargement impossible" : "Could not load"));
        return;
      }
      setItems((data.items || []) as CreatorInfoRow[]);
      setError("");
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setLoading(false);
    }
  }, [userId, fr, section]);

  useEffect(() => {
    setLoading(true);
    void load();
    if (!userId) return;
    const onUpdated = () => void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("trackit:infos-updated", onUpdated);
    window.addEventListener("trackit:rules-updated", onUpdated);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("trackit:infos-updated", onUpdated);
      window.removeEventListener("trackit:rules-updated", onUpdated);
    };
  }, [load, userId]);

  const emptyCopy =
    section === "howto"
      ? fr
        ? "La marque n’a pas encore publié « Comment ça marche »."
        : "The brand hasn’t published “How it works” yet."
      : section === "pricing"
        ? fr
          ? "La marque n’a pas encore publié de modèle de pricing."
          : "The brand hasn’t published a pricing model yet."
        : fr
          ? "Aucune règle pour l’instant. Dès que la marque en publie, elles apparaîtront ici."
          : "No rules yet. When the brand publishes some, they’ll show up here.";

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-bg)", color: "var(--ws-text)", padding: pagePad(isMobile) }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
          {kindLabel(section, fr)}
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--ws-text-muted)", letterSpacing: "-0.02em" }}>
          {fr ? "Défini par la marque — lecture seule." : "Set by the brand — read only."}
        </p>

        {error ? <p style={{ color: "#f97316", fontSize: 13.5, margin: "0 0 16px" }}>{error}</p> : null}

        {loading ? (
          <p style={{ color: "var(--ws-text-muted)", fontSize: 14 }}>{fr ? "Chargement…" : "Loading…"}</p>
        ) : items.length === 0 ? (
          <div
            style={{
              borderRadius: 16,
              border: "1px solid var(--ws-border)",
              background: "var(--ws-surface)",
              padding: isMobile ? "28px 22px" : "40px 36px",
              color: "var(--ws-text-muted)",
              fontSize: 15,
              lineHeight: 1.5,
              letterSpacing: "-0.02em",
            }}
          >
            {emptyCopy}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {items.map((r) => (
              <article
                key={r.brandId}
                style={{
                  borderRadius: 16,
                  border: "1px solid var(--ws-border)",
                  background: "var(--ws-surface)",
                  padding: isMobile ? "22px 20px" : "28px 28px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                {r.brandName ? (
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 650,
                      color: "#0047ff",
                      letterSpacing: "-0.02em",
                      marginBottom: 12,
                      textTransform: "uppercase",
                    }}
                  >
                    {r.brandName}
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 15.5,
                    lineHeight: 1.6,
                    letterSpacing: "-0.02em",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "var(--ws-text)",
                  }}
                >
                  {r.body}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtn: CSSProperties = {
  background: "var(--ws-accent)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 500,
  fontFamily: "inherit",
  letterSpacing: "-0.02em",
  flexShrink: 0,
};
