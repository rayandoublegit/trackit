"use client";

import { useEffect, useMemo, useState } from "react";

const NICHE_OPTIONS = [
  { value: "fitness", label: "Fitness", emoji: "🏋️" },
  { value: "fashion", label: "Fashion", emoji: "👗" },
  { value: "beauty", label: "Beauty", emoji: "💄" },
  { value: "tech", label: "Tech", emoji: "📱" },
  { value: "food", label: "Food", emoji: "🍴" },
  { value: "travel", label: "Travel", emoji: "✈️" },
] as const;

type NicheStat = {
  niche: string;
  total: number;
  curated: number;
  target: number;
  min: number;
  max: number;
  under10k: number;
  from10kto100k: number;
  over100k: number;
};

type LookupRequest = {
  normalized: string;
  query: string;
  count: number;
  lastAt: string;
};

type StatsData = {
  total: number;
  curated: number;
  niches: NicheStat[];
  lookupRequests: LookupRequest[];
};

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    const s = v % 1 === 0 ? String(v) : v.toFixed(1);
    return `${s.replace(".", ",")}M`;
  }
  if (n >= 10_000) {
    const v = n / 1_000;
    const s = v % 1 === 0 ? String(v) : v.toFixed(1);
    return `${s.replace(".", ",")}k`;
  }
  return n.toLocaleString("fr-FR");
}

function nicheMeta(value: string) {
  return NICHE_OPTIONS.find((o) => o.value === value) ?? { value, label: value, emoji: "📌" };
}

function statusBadge(curated: number): { label: string; bg: string; color: string } {
  if (curated === 0) return { label: "À FAIRE", bg: "#fdecea", color: "#c62828" };
  if (curated < 50) return { label: "EN COURS", bg: "#fff3e0", color: "#e65100" };
  return { label: "BIEN", bg: "#e8f5e9", color: "#2e7d32" };
}

const INITIAL_STATE = {
  secret: "",
  pseudo: "",
  loading: false,
  error: "",
  unlocked: false,
  data: null as StatsData | null,
  selectedNiche: "",
};

export default function AdminStatsPage() {
  const [secret, setSecret] = useState(INITIAL_STATE.secret);
  const [pseudo, setPseudo] = useState(INITIAL_STATE.pseudo);
  const [loading, setLoading] = useState(INITIAL_STATE.loading);
  const [error, setError] = useState(INITIAL_STATE.error);
  const [unlocked, setUnlocked] = useState(INITIAL_STATE.unlocked);
  const [data, setData] = useState<StatsData | null>(INITIAL_STATE.data);
  const [selectedNiche, setSelectedNiche] = useState(INITIAL_STATE.selectedNiche);

  const resetPage = () => {
    setSecret(INITIAL_STATE.secret);
    setPseudo(INITIAL_STATE.pseudo);
    setLoading(INITIAL_STATE.loading);
    setError(INITIAL_STATE.error);
    setUnlocked(INITIAL_STATE.unlocked);
    setData(INITIAL_STATE.data);
    setSelectedNiche(INITIAL_STATE.selectedNiche);
  };

  // Au montage: on restaure le pseudo et le secret sauvegardes (localStorage)
  // pour qu'un refresh ne renvoie pas a l'ecran de saisie.
  useEffect(() => {
    try {
      const savedPseudo = localStorage.getItem("trackit_admin_pseudo");
      if (savedPseudo) setPseudo(savedPseudo);
      const savedSecret = localStorage.getItem("trackit_admin_secret");
      if (savedSecret) {
        setSecret(savedSecret);
        // Auto-deverrouille avec le secret memorise.
        void unlockWith(savedSecret);
      }
    } catch {
      // localStorage indisponible (navigation privee, etc.): on ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curationRate = useMemo(() => {
    if (!data || data.total === 0) return 0;
    return Math.round((data.curated / data.total) * 100);
  }, [data]);

  const selected = useMemo(() => {
    if (!selectedNiche || !data) return null;
    const found = data.niches.find((n) => n.niche === selectedNiche);
    if (found) return found;
    return {
      niche: selectedNiche,
      total: 0,
      curated: 0,
      target: 100,
      min: 0,
      max: 0,
      under10k: 0,
      from10kto100k: 0,
      over100k: 0,
    };
  }, [data, selectedNiche]);

  const unlockWith = async (secretValue: string) => {
    const cleanSecret = secretValue.trim();
    if (!cleanSecret) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", {
        method: "GET",
        headers: { Authorization: `Bearer ${cleanSecret}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) {
        setUnlocked(false);
        setData(null);
        setError("Accès refusé");
        // Secret invalide: on l'oublie pour ne pas reboucler au prochain refresh.
        try { localStorage.removeItem("trackit_admin_secret"); } catch {}
        return;
      }
      // Secret valide: on le memorise pour survivre au refresh.
      try { localStorage.setItem("trackit_admin_secret", cleanSecret); } catch {}
      setData({
        total: Number(json.total) || 0,
        curated: Number(json.curated) || 0,
        niches: (Array.isArray(json.niches) ? json.niches : []).map((n: NicheStat) => ({
          niche: String(n.niche),
          total: Number(n.total) || 0,
          curated: Number(n.curated) || 0,
          target: Number(n.target) || 100,
          min: Number(n.min) || 0,
          max: Number(n.max) || 0,
          under10k: Number(n.under10k) || 0,
          from10kto100k: Number(n.from10kto100k) || 0,
          over100k: Number(n.over100k) || 0,
        })),
        lookupRequests: (Array.isArray(json.lookupRequests) ? json.lookupRequests : []).map((r: LookupRequest) => ({
          normalized: String(r.normalized),
          query: String(r.query),
          count: Number(r.count) || 0,
          lastAt: String(r.lastAt),
        })),
      });
      setUnlocked(true);
      setSelectedNiche("");
    } catch (e) {
      setUnlocked(false);
      setData(null);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const card: React.CSSProperties = {
    background: "#fff",
    borderRadius: 18,
    padding: "20px 22px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    border: "1px solid rgba(0,0,0,0.04)",
  };

  const field: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e5e5e5",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
    background: "#fff",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        letterSpacing: "-0.02em",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 48px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="https://i.ibb.co/20jgns98/navbarlogotransparent.png"
              alt="Trackit"
              style={{ height: 48, width: "auto", display: "block", objectFit: "contain" }}
            />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111" }}>Curation Dashboard</h1>
          </div>
          {pseudo.trim() ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: "#333", whiteSpace: "nowrap" }}>
              Salut {pseudo.trim()} 👋
            </div>
          ) : (
            <input
              style={{ ...field, width: 140, marginBottom: 0 }}
              value={pseudo}
              onChange={(e) => { setPseudo(e.target.value); try { localStorage.setItem("trackit_admin_pseudo", e.target.value); } catch {} }}
              placeholder="Pseudo"
              autoComplete="off"
            />
          )}
        </div>

        {/* Lock screen */}
        {!unlocked ? (
          <div style={card}>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 6, display: "block" }}>Secret admin</label>
            <input
              style={{ ...field, marginBottom: 12 }}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button
              onClick={() => unlockWith(secret)}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: loading ? "#999" : "#0047FF",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Vérification…" : "Débloquer"}
            </button>
            {error ? <div style={{ marginTop: 12, fontSize: 13, color: "#c62828" }}>{error}</div> : null}
          </div>
        ) : (
          <>
            {/* Global stats */}
            {data && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                <div style={card}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>{formatCompact(data.total)}</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>créateurs scrapés</div>
                </div>
                <div style={card}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#0047FF" }}>{formatCompact(data.curated)}</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>curés au total</div>
                </div>
                <div style={card}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>{curationRate}%</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>taux de curation</div>
                </div>
              </div>
            )}

            {/* Niche dropdown */}
            <div style={{ marginBottom: 20 }}>
              <select
                value={selectedNiche}
                onChange={(e) => setSelectedNiche(e.target.value)}
                style={{
                  ...field,
                  appearance: "none",
                  WebkitAppearance: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  color: selectedNiche ? "#111" : "#888",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23666' d='M1 1l5 5 5-5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 14px center",
                  paddingRight: 36,
                }}
              >
                <option value="">Choisir une niche…</option>
                {NICHE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Placeholder or detail */}
            {!selectedNiche ? (
              <div
                style={{
                  ...card,
                  textAlign: "center",
                  padding: "48px 24px",
                  color: "#aaa",
                  fontSize: 15,
                }}
              >
                ← Choisis une niche pour voir le détail
              </div>
            ) : selected ? (
              (() => {
                const meta = nicheMeta(selected.niche);
                const badge = statusBadge(selected.curated);
                const target = selected.target || 100;
                const pct = Math.min(100, (selected.curated / target) * 100);
                const remaining = Math.max(0, target - selected.curated);
                const notCurated = selected.total - selected.curated;

                return (
                  <div style={card}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#111" }}>
                        {meta.emoji} {meta.label}
                      </h2>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "5px 10px",
                          borderRadius: 999,
                          background: badge.bg,
                          color: badge.color,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 36, fontWeight: 700, color: "#111", marginBottom: 12 }}>
                      {selected.curated} / {target} curés
                    </div>

                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: "#e8e8e8",
                        overflow: "hidden",
                        marginBottom: 20,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 999,
                          background: "#0047FF",
                          transition: "width 0.35s ease",
                        }}
                      />
                    </div>

                    <p style={{ fontSize: 14, color: "#444", margin: "0 0 8px" }}>
                      Il reste <strong>{remaining}</strong> créateurs à curer pour cette niche
                    </p>
                    <p style={{ fontSize: 14, color: "#666", margin: "0 0 24px" }}>
                      {formatCompact(selected.total)} créateurs scrapés disponibles, dont{" "}
                      <strong>{formatCompact(Math.max(0, notCurated))}</strong> pas encore curés
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                      {[
                        { label: "< 10k", value: selected.under10k },
                        { label: "10k – 100k", value: selected.from10kto100k },
                        { label: "> 100k", value: selected.over100k },
                      ].map((s) => (
                        <div
                          key={s.label}
                          style={{
                            background: "#F7F7F8",
                            borderRadius: 12,
                            padding: "12px 10px",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>{s.value}</div>
                          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
                      De {formatCompact(selected.min)} à {formatCompact(selected.max)} abonnés
                    </p>
                  </div>
                );
              })()
            ) : null}
            {/* Createurs demandes par les marques (recherches sans resultat) */}
            {data && data.lookupRequests.length > 0 && (
              <div style={{ ...card, marginTop: 24 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "#111" }}>
                  Créateurs demandés par les marques
                </h2>
                <p style={{ fontSize: 13, color: "#888", margin: "0 0 16px" }}>
                  Recherches qui n&apos;ont rien trouvé. À scraper en priorité (les plus demandés en haut).
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.lookupRequests.map((r) => (
                    <div
                      key={r.normalized}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#F7F7F8",
                        borderRadius: 12,
                        padding: "10px 14px",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          @{r.normalized}
                        </div>
                        <div style={{ fontSize: 12, color: "#999" }}>
                          demandé le {new Date(r.lastAt).toLocaleDateString("fr-FR")}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          padding: "4px 12px",
                          borderRadius: 999,
                          background: r.count > 1 ? "#0047FF" : "#e8e8e8",
                          color: r.count > 1 ? "#fff" : "#666",
                          whiteSpace: "nowrap",
                          marginLeft: 12,
                        }}
                      >
                        {r.count} {r.count > 1 ? "demandes" : "demande"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
