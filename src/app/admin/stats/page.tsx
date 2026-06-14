"use client";

import { useMemo, useState } from "react";

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

type StatsResponse = {
  ok: boolean;
  error?: string;
  total?: number;
  curated?: number;
  byPlatform?: Record<string, number>;
  niches?: NicheStat[];
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

export default function AdminStatsPage() {
  const [secret, setSecret] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const sortedNiches = useMemo(() => {
    if (!stats?.niches) return [];
    return [...stats.niches].sort((a, b) => b.total - a.total);
  }, [stats]);

  const platforms = useMemo(() => {
    if (!stats?.byPlatform) return [];
    return Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const loadStats = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data: StatsResponse = await res.json();
      if (!data.ok) {
        setStats(null);
        setError(data.error || "Échec du chargement");
        return;
      }
      setStats(data);
    } catch (e) {
      setStats(null);
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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Stats créateurs</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
        Vue d&apos;ensemble de la base créateurs et de la curation par niche.
      </p>

      {pseudo.trim() && (
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#111" }}>
          Salut {pseudo.trim()} 👋
        </div>
      )}

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
        placeholder="ton prénom ou pseudo"
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
        {loading ? "Chargement…" : "Charger les stats"}
      </button>

      {error && (
        <div style={{ fontSize: 13, color: "#c00", marginBottom: 16 }}>{error}</div>
      )}

      {stats?.ok && (
        <>
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 16,
              marginBottom: 14,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 12, color: "#999", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Vue globale
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>{formatCompact(stats.total ?? 0)}</div>
                <div style={{ fontSize: 12, color: "#666" }}>créateurs total</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#0047FF" }}>{formatCompact(stats.curated ?? 0)}</div>
                <div style={{ fontSize: 12, color: "#666" }}>curated</div>
              </div>
            </div>
            {platforms.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "#777", marginBottom: 8 }}>Par plateforme</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {platforms.map(([platform, count]) => (
                    <span
                      key={platform}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "#f5f5f5",
                        border: "1px solid #eee",
                        color: "#333",
                      }}
                    >
                      {platform} · {formatCompact(count)}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {sortedNiches.map((n) => {
            const pct = n.target > 0 ? Math.min(100, (n.total / n.target) * 100) : 0;
            return (
              <div
                key={n.niche}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 14,
                  background: "#fafafa",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#111", textTransform: "capitalize" }}>
                    {n.niche}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {n.total}/{n.target}
                    {n.curated > 0 && (
                      <span style={{ color: "#0047FF", marginLeft: 6 }}>· {n.curated} curated</span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "#e8e8e8",
                    overflow: "hidden",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 999,
                      background: pct >= 100 ? "#1a7f37" : "#0047FF",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>Followers</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#444" }}>
                    &lt;10k · {n.under10k}
                  </span>
                  <span style={{ fontSize: 12, color: "#444" }}>
                    10k–100k · {n.from10kto100k}
                  </span>
                  <span style={{ fontSize: 12, color: "#444" }}>
                    &gt;100k · {n.over100k}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  Fourchette {formatCompact(n.min)} – {formatCompact(n.max)}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
