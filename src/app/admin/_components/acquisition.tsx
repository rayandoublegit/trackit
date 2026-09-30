"use client";

import { useState } from "react";
import type { AcquisitionFunnel } from "@/lib/admin-acquisition";
import type { OverviewData } from "@/lib/admin-types";
import { useLang } from "@/lib/useLang";
import { BarList, Funnel } from "./charts";
import { channelLabel } from "./labels";
import { Card, Empty, useAdminFormat, useT } from "./ui";

type Period = "d30" | "all";

/** Where brand signups come from, and how each source converts to paying. */
export function AcquisitionSection({ acquisition }: { acquisition: OverviewData["acquisition"] }) {
  const [period, setPeriod] = useState<Period>("d30");
  const t = useT();
  const lang = useLang();
  const { num, pct } = useAdminFormat();

  const toggle = (
    <div className="ad-seg" role="group" aria-label={t("Period", "Période")}>
      {(
        [
          ["d30", t("30 days", "30 jours")],
          ["all", t("All time", "Depuis le début")],
        ] as const
      ).map(([key, label]) => (
        <button key={key} type="button" className={period === key ? "is-on" : ""} aria-pressed={period === key} onClick={() => setPeriod(key)}>
          {label}
        </button>
      ))}
    </div>
  );

  if (!acquisition) {
    return (
      <Card title={t("Acquisition", "Acquisition")}>
        <Empty>{t("Sources could not be read (profiles.referral_source).", "Les sources n’ont pas pu être lues (profiles.referral_source).")}</Empty>
      </Card>
    );
  }

  const f: AcquisitionFunnel = acquisition[period];
  const total = f.total;

  return (
    <div className="ad-grid ad-grid--wide">
      <Card title={t("Funnel by source · brands", "Funnel par source · marques")} aside={toggle}>
        {total.signups === 0 ? (
          <Empty>{t("No brand signup in this period.", "Aucune inscription de marque sur cette période.")}</Empty>
        ) : (
          <>
            <Funnel
              steps={[
                { label: t("Signups", "Inscriptions"), value: total.signups },
                { label: t("Onboarding done", "Onboarding terminé"), value: total.onboarded },
                { label: t("Paying", "Payants"), value: total.paying },
              ]}
            />
            <div className="ad-table-wrap" style={{ marginTop: 16 }}>
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>{t("Source", "Source")}</th>
                    <th className="ad-num">{t("Signups", "Inscrits")}</th>
                    <th className="ad-num">{t("Onboarded", "Onboardés")}</th>
                    <th className="ad-num">{t("Signup → onb.", "Inscr. → onb.")}</th>
                    <th className="ad-num">{t("Paying", "Payants")}</th>
                    <th className="ad-num">{t("Onb. → paying", "Onb. → payant")}</th>
                    <th className="ad-num">{t("Signup → paying", "Inscr. → payant")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...f.bySource, total].map((r) => (
                    <tr key={r.key} style={r.key === "all" ? { fontWeight: 700 } : undefined}>
                      <td>{channelLabel(r.key, lang)}</td>
                      <td className="ad-num">{num(r.signups)}</td>
                      <td className="ad-num">{num(r.onboarded)}</td>
                      <td className="ad-num">{pct(r.onboardRatePct)}</td>
                      <td className="ad-num">{num(r.paying)}</td>
                      <td className="ad-num">{pct(r.payFromOnboardedPct)}</td>
                      <td className="ad-num">{pct(r.payRatePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      <Card title={t("Where signups come from", "D’où viennent les inscrits")}>
        {total.signups === 0 ? (
          <Empty>—</Empty>
        ) : (
          <BarList
            items={f.bySource.map((r) => ({
              key: r.key,
              value: r.signups,
              hint: t(
                `${pct((r.signups / total.signups) * 100)} of signups · ${num(r.paying)} paying`,
                `${pct((r.signups / total.signups) * 100)} des inscrits · ${num(r.paying)} payant${r.paying > 1 ? "s" : ""}`,
              ),
            }))}
            format={num}
            labelOf={(k) => channelLabel(k, lang)}
          />
        )}
      </Card>
    </div>
  );
}
