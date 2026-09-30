"use client";

import Link from "next/link";
import { Donut } from "../_components/charts";
import { useLang } from "@/lib/useLang";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, useAdminData, useAdminFormat, useT } from "../_components/ui";

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

const NICHE_LABEL_FR: Record<string, string> = {
  fitness: "Fitness",
  fashion: "Mode",
  beauty: "Beauté",
  tech: "Tech",
  food: "Food",
  travel: "Voyage",
};

const TIER_LABEL: Record<string, string> = { nano: "Nano · < 10,000", micro: "Micro · 10,000–99,999", influencer: "Influencer · 100,000+" };
const TIER_LABEL_FR: Record<string, string> = { nano: "Nano · < 10 000", micro: "Micro · 10 000–99 999", influencer: "Influenceur · 100 000+" };

export default function AdminCatalogPage() {
  const { data, error, loading, reload } = useAdminData<CatalogData>("/api/admin/stats");
  const { compact, num, pct } = useAdminFormat();
  const t = useT();
  const fr = useLang() === "fr";
  const tiers = data
    ? data.niches.reduce(
        (acc, n) => ({ nano: acc.nano + n.under10k, micro: acc.micro + n.from10kto100k, influencer: acc.influencer + n.over100k }),
        { nano: 0, micro: 0, influencer: 0 },
      )
    : null;

  return (
    <>
      <PageHead
        title={t("Creator catalog", "Catalogue créateurs")}
        lead={t(
          "What search can offer brands. A creator tagged in several niches counts in each one.",
          "Ce que la recherche peut proposer aux marques. Un créateur classé dans plusieurs niches compte dans chacune.",
        )}
        actions={
          <>
            <Link className="ad-btn ad-btn--primary" href="/admin/add">
              {t("Add a creator", "Ajouter un créateur")}
            </Link>
            <RefreshButton onClick={reload} loading={loading} />
          </>
        }
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && tiers ? (
        <>
          <div className="ad-grid ad-grid--kpi">
            <Kpi label={t("Indexed profiles", "Profils indexés")} value={data.total} format={compact} tone="accent" />
            <Kpi
              label={t("Hand-verified", "Vérifiés à la main")}
              value={data.curated}
              delay={60}
              sub={<>{pct(data.total ? (data.curated / data.total) * 100 : 0)} {t("of the catalog", "du catalogue")}</>}
            />
            <Kpi label={t("Tracked niches", "Niches suivies")} value={data.niches.length} delay={120} />
            <Kpi
              label={t("Niches below target", "Niches sous l’objectif")}
              value={data.niches.filter((n) => n.curated < n.target).length}
              delay={180}
              tone="warn"
              sub={
                fr ? (
                  <>objectif : {num(data.niches[0]?.target ?? 100)} vérifiés par niche</>
                ) : (
                  <>target: {num(data.niches[0]?.target ?? 100)} verified per niche</>
                )
              }
            />
          </div>
          <div className="ad-grid ad-grid--wide">
            <Card title={t("Niches", "Niches")} className="ad-card--flush" delay={80}>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>{t("Niche", "Niche")}</th>
                      <th className="ad-num">{t("Profiles", "Profils")}</th>
                      <th>{t("Nano · micro · influencer split", "Répartition nano · micro · influenceur")}</th>
                      <th>{t("Verified / target", "Vérifiés / objectif")}</th>
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
                              <strong>{(fr ? NICHE_LABEL_FR : NICHE_LABEL)[n.niche] ?? n.niche}</strong>
                            </td>
                            <td className="ad-num">{num(n.total)}</td>
                            <td style={{ minWidth: 200 }}>
                              <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--ad-surface-2)" }}>
                                <span style={{ width: `${(n.under10k / t) * 100}%`, background: "#93b4ff" }} title={fr ? `Nano : ${num(n.under10k)}` : `Nano: ${num(n.under10k)}`} />
                                <span style={{ width: `${(n.from10kto100k / t) * 100}%`, background: "#3b6bff" }} title={fr ? `Micro : ${num(n.from10kto100k)}` : `Micro: ${num(n.from10kto100k)}`} />
                                <span style={{ width: `${(n.over100k / t) * 100}%`, background: "#0a2a99" }} title={fr ? `Influenceur : ${num(n.over100k)}` : `Influencer: ${num(n.over100k)}`} />
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
                {data.niches.length === 0 ? <Empty>{t("No niches.", "Aucune niche.")}</Empty> : null}
              </div>
            </Card>
            <Card title={t("Follower tiers", "Paliers d’abonnés")} delay={120}>
              <Donut
                parts={[
                  { key: "nano", value: tiers.nano },
                  { key: "micro", value: tiers.micro },
                  { key: "influencer", value: tiers.influencer },
                ]}
                labelOf={(k) => (fr ? TIER_LABEL_FR : TIER_LABEL)[k] ?? k}
                center={{ value: compact(tiers.nano + tiers.micro + tiers.influencer), label: t("profiles × niches", "profils × niches") }}
              />
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
