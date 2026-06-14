"use client";

import { useMemo, useState } from "react";

type NicheRow = {
  niche: string;
  total: number;
  curated: number;
  target: number;
};

type StatsData = {
  total: number;
  curated: number;
  niches: NicheRow[];
};

function barColor(curated: number, target: number): string {
  if (curated === 0) return "#e53935";
  if (target <= 0) return "#fb8c00";
  const ratio = curated / target;
  if (ratio < 0.5) return "#fb8c00";
  return "#43a047";
}

export default function AdminStatsPage() {
  const [secret, setSecret] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StatsData | null>(null);

  const niches = useMemo(() => {
    if (!data) return [];
    return [...data.niches].sort((a, b) => a.curated - b.curated);
  }, [data]);

  const loadStats = async () => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch("/api/admin/stats", {
        method: "GET",
        headers: { Authorization: `Bearer ${secret.trim()}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Accès refusé");
        return;
      }
      setData({
        total: Number(json.total) || 0,
        curated: Number(json.curated) || 0,
        niches: (Array.isArray(json.niches) ? json.niches : []).map((n: NicheRow) => ({
          niche: String(n.niche),
          total: Number(n.total) || 0,
          curated: Number(n.curated) || 0,
          target: Number(n.target) || 0,
        })),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    marginBottom: 8,
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const label: React.CSSProperties = { fontSize: 11, color: "#777", marginBottom: 3, display: "block" };

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Curation</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
        Où en est-on ? Les niches en haut = celles où il faut curer en priorité.
      </p>

      {pseudo.trim() ? (
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Salut {pseudo.trim()}</div>
      ) : null}

      <label style={label}>Admin secret</label>
      <input
        style={field}
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="admin secret"
      />

      <label style={label}>Pseudo (optionnel)</label>
      <input
        style={{ ...field, marginBottom: 16 }}
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        placeholder="ton prénom"
      />

      <button
        onClick={loadStats}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px",
          background: loading ? "#999" : "#0047FF",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
          marginBottom: 16,
        }}
      >
        {loading ? "Chargement…" : "Voir les stats"}
      </button>

      {error ? <div style={{ fontSize: 13, color: "#c00", marginBottom: 16 }}>{error}</div> : null}

      {data ? (
        <>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>
              {data.total.toLocaleString("fr-FR")} créateurs dans la base
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, color: "#0047FF" }}>
              {data.curated.toLocaleString("fr-FR")} curated
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {niches.map((n) => {
              const pct = n.target > 0 ? Math.min(100, (n.curated / n.target) * 100) : 0;
              const color = barColor(n.curated, n.target);
              return (
                <div
                  key={n.niche}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: "12px 14px",
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 15, fontWeight: 600, textTransform: "capitalize" }}>
                      {n.niche}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {n.curated} / {n.target} curated
                    </div>
                    <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>
                      {n.total.toLocaleString("fr-FR")} scrapés
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "#eee", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: 999,
                        background: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
