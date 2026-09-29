"use client";

import Link from "next/link";
import { Donut } from "../_components/charts";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, compact, num, pct, useAdminData } from "../_components/ui";

type NicheRow = {
  niche: string;
  total: number;
  curated: number;
  min: number;
  max: number;
  under10k: number;
  from10kto100k: number;
  over100k: number;
  target: number;
};

type CatalogData = { ok: true; total: number; curated: number; niches: NicheRow[] };

const NICHE_LABEL: Record<string, string> = {
  fitness: "Fitness",
  fashion: "Fashion",
  beauty: "Beauty",
  tech: "Tech",
  food: "Food",
  travel: "Travel",
};

export default function AdminCatalogPage() {
  const { data, error, loading, reload } = useAdminData<CatalogData>("/api/admin/stats");
  const tiers = data
    ? data.niches.reduce(
        (acc, n) => ({ nano: acc.nano + n.under10k, micro: acc.micro + n.from10kto100k, influencer: acc.influencer + n.over100k }),
        { nano: 0, micro: 0, influencer: 0 },
      )
    : null;

  return (
    <>
      <PageHead
        title="Creator catalog"
        lead="What search can offer brands. A creator tagged in several niches counts in each one."
        actions={
          <>
            <Link className="ad-btn ad-btn--primary" href="/admin/add">
              Add a creator
            </Link>
            <RefreshButton onClick={reload} loading={loading} />
          </>
        }
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && tiers ? (
        <>
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="Indexed profiles" value={data.total} format={compact} tone="accent" />
            <Kpi label="Hand-verified" value={data.curated} delay={60} sub={<>{pct(data.total ? (data.curated / data.total) * 100 : 0)} of the catalog</>} />
            <Kpi label="Tracked niches" value={data.niches.length} delay={120} />
            <Kpi
              label="Niches below target"
              value={data.niches.filter((n) => n.curated < n.target).length}
              delay={180}
              tone="warn"
              sub={<>target: {num(data.niches[0]?.target ?? 100)} verified per niche</>}
            />
          </div>
          <div className="ad-grid ad-grid--wide">
            <Card title="Niches" className="ad-card--flush" delay={80}>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Niche</th>
                      <th className="ad-num">Profiles</th>
                      <th>Nano · micro · influencer split</th>
                      <th>Verified / target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.niches]
                      .sort((a, b) => b.total - a.total)
                      .map((n) => {
                        const t = Math.max(1, n.total);
                        return (
                          <tr key={n.niche}>
                            <td>
                              <strong>{NICHE_LABEL[n.niche] ?? n.niche}</strong>
                            </td>
                            <td className="ad-num">{num(n.total)}</td>
                            <td style={{ minWidth: 200 }}>
                              <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--ad-surface-2)" }}>
                                <span style={{ width: `${(n.under10k / t) * 100}%`, background: "#93b4ff" }} title={`Nano: ${num(n.under10k)}`} />
                                <span style={{ width: `${(n.from10kto100k / t) * 100}%`, background: "#3b6bff" }} title={`Micro: ${num(n.from10kto100k)}`} />
                                <span style={{ width: `${(n.over100k / t) * 100}%`, background: "#0a2a99" }} title={`Influencer: ${num(n.over100k)}`} />
                              </div>
                              <small style={{ color: "var(--ad-muted)", fontSize: 11.5 }}>
                                {num(n.under10k)} · {num(n.from10kto100k)} · {num(n.over100k)}
                              </small>
                            </td>
                            <td style={{ minWidth: 150 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div className="ad-barlist__track" style={{ flex: 1 }}>
                                  <span style={{ ["--w" as string]: `${Math.min(100, (n.curated / Math.max(1, n.target)) * 100)}%` }} />
                                </div>
                                {n.curated >= n.target ? <Pill tone="good">OK</Pill> : <small>{num(n.curated)}/{num(n.target)}</small>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {data.niches.length === 0 ? <Empty>No niches.</Empty> : null}
              </div>
            </Card>
            <Card title="Follower tiers" delay={120}>
              <Donut
                parts={[
                  { key: "nano", value: tiers.nano },
                  { key: "micro", value: tiers.micro },
                  { key: "influencer", value: tiers.influencer },
                ]}
                labelOf={(k) => ({ nano: "Nano · < 10,000", micro: "Micro · 10,000–99,999", influencer: "Influencer · 100,000+" })[k] ?? k}
                center={{ value: compact(tiers.nano + tiers.micro + tiers.influencer), label: "profiles × niches" }}
              />
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
