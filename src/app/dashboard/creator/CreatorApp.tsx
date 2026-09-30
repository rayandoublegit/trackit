"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLang } from "@/lib/useLang";
import { setAppLang } from "@/lib/locale-preferences";
import { legalLinks } from "@/lib/legal-links";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import { useCreatorStats, type CreatorStatsData } from "@/lib/useCreatorStats";
import { uploadGiftVideoResumable } from "@/lib/gift-video-upload";
import { PersonGlyph } from "@/components/FallbackGlyphs";
import { creatorCopy, type CreatorCopy, type MissionStage } from "./creator-copy";
import { DEMO_LINK, DEMO_STATS, demoGifting } from "./creator-demo";
import "./creator-app.css";

// Creator side of Trackit: one column, one obvious next action, four tabs.
// Everything a creator does (accept, sign, confirm the parcel, send the
// video, get paid) is one button away.

type Tab = "home" | "missions" | "earnings" | "profile";
type Campaign = { id: string; name: string; product: string; deadline: string; video_count?: number; brief?: string };
type Mission = {
  id: string;
  campaign_id: string;
  status: string;
  contract_text: string;
  signed_name: string | null;
  carrier: string | null;
  tracking_number: string | null;
};
type Video = { mission_id: string; name: string; status: string; feedback: string };
type Gifting = { campaigns: Campaign[]; missions: Mission[]; videos: Video[] };
type Payout = { method: "paypal" | "revolut" | "iban"; value: string; holder: string; bank: string };

const PREVIEW = Boolean(DEV_BYPASS_PLAN);

// ── Mission logic ─────────────────────────────────────────────
function stageOf(mission: Mission, video?: Video): MissionStage {
  if (mission.status === "submitted" && video?.status === "changes_requested") return "changes";
  const known: MissionStage[] = ["invited", "accepted", "signed", "shipped", "delivered", "submitted", "approved", "declined"];
  return known.includes(mission.status as MissionStage) ? (mission.status as MissionStage) : "signed";
}

const STEP_OF: Record<MissionStage, number> = { invited: 1, accepted: 2, signed: 3, shipped: 3, delivered: 4, changes: 4, submitted: 4, approved: 5, declined: 0 };
// Creator has something to do first, then waiting on the brand, then done.
const PRIORITY: Record<MissionStage, number> = { invited: 0, accepted: 0, shipped: 0, delivered: 0, changes: 0, signed: 1, submitted: 1, approved: 2, declined: 3 };
const NEEDS_ME = new Set<MissionStage>(["invited", "accepted", "shipped", "delivered", "changes"]);

// ── Formatting ────────────────────────────────────────────────
function useFormat(lang: "en" | "fr") {
  return useMemo(() => {
    const locale = lang === "fr" ? "fr-FR" : "en-US";
    const euros = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
    const whole = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
    return {
      money: (n: number) => euros.format(n),
      moneyShort: (n: number) => (Math.abs(n) >= 1000 ? whole.format(n) : euros.format(n)),
      date: (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" }),
      shortDate: (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" }),
    };
  }, [lang]);
}

// ── Icons (real icons, never emoji) ───────────────────────────
function Icon({ d, size = 20 }: { d: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}
const I = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  missions: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8S10.5 3 7.5 3 5 6.5 12 8zM12 8s1.5-5 4.5-5S19 6.5 12 8z" /></>,
  earnings: <><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M16.5 15h2" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13M12 8S10.5 3 7.5 3 5 6.5 12 8zM12 8s1.5-5 4.5-5S19 6.5 12 8z" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  upload: <><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></>,
  out: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
};

function Avatar({ url, size = 36 }: { url: string | null; size?: number }) {
  return (
    <span className="ca-avatar" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" />
      ) : (
        <PersonGlyph size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="ca-steps" aria-hidden>
      {labels.map((label, i) => (
        <span key={label} className={i + 1 < current ? "is-done" : i + 1 === current ? "is-now" : ""}>
          <i />
          <small>{label}</small>
        </span>
      ))}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────
export function CreatorApp({
  userId,
  name,
  username,
  avatarUrl,
  onSignOut,
}: {
  userId?: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  onSignOut: () => void;
}) {
  const lang = useLang();
  const t = creatorCopy(lang);
  const f = useFormat(lang);
  const [tab, setTab] = useState<Tab>("home");
  const [openId, setOpenId] = useState<string | null>(null);
  const [gifting, setGifting] = useState<Gifting | null>(null);
  const [giftError, setGiftError] = useState(false);
  const [link, setLink] = useState<{ link: string | null; code: string | null } | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [payoutLoaded, setPayoutLoaded] = useState(false);
  const { stats: liveStats, loading: statsLoading } = useCreatorStats(PREVIEW ? undefined : userId);
  const stats: CreatorStatsData | null = PREVIEW ? DEMO_STATS : liveStats;
  const first = (name || username || "").trim().split(/\s+/)[0]?.replace(/^@/, "") ?? "";

  const loadGifting = useCallback(async () => {
    if (PREVIEW) {
      setGifting(demoGifting(lang));
      return;
    }
    try {
      const res = await fetch("/api/gifting", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "load");
      setGifting({ campaigns: body.campaigns ?? [], missions: body.missions ?? [], videos: body.videos ?? [] });
      setGiftError(false);
    } catch {
      setGiftError(true);
      setGifting((current) => current ?? { campaigns: [], missions: [], videos: [] });
    }
  }, [lang]);

  useEffect(() => {
    void loadGifting();
  }, [loadGifting]);

  useEffect(() => {
    if (PREVIEW) {
      setLink(DEMO_LINK);
      setPayoutLoaded(true);
      return;
    }
    if (!userId) return;
    let cancelled = false;
    void fetch(`/api/creator/affiliate-link?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && body?.ok) setLink({ link: body.link ?? null, code: body.code ?? null });
      })
      .catch(() => undefined);
    void fetch(`/api/creator/payment?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !body?.ok) return;
        if (body.paypal) setPayout({ method: "paypal", value: body.paypal, holder: "", bank: "" });
        else if (body.revolut) setPayout({ method: "revolut", value: body.revolut, holder: "", bank: "" });
        else if (body.iban) setPayout({ method: "iban", value: body.iban, holder: body.accountHolder || "", bank: body.bankName || "" });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPayoutLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Missions sorted: what needs me, what waits on the brand, what is done.
  const missions = useMemo(() => {
    if (!gifting) return [];
    return gifting.missions
      .map((mission) => {
        const video = gifting.videos.find((v) => v.mission_id === mission.id);
        const campaign = gifting.campaigns.find((c) => c.id === mission.campaign_id);
        return { mission, video, campaign, stage: stageOf(mission, video) };
      })
      .sort((a, b) => PRIORITY[a.stage] - PRIORITY[b.stage]);
  }, [gifting]);

  const active = missions.filter((m) => m.stage !== "approved" && m.stage !== "declined");
  const current = missions.find((m) => m.stage !== "declined") ?? null;
  const open = missions.find((m) => m.mission.id === openId) ?? null;

  const act = async (missionId: string, action: Record<string, unknown>): Promise<boolean> => {
    if (PREVIEW) {
      // Local preview: move the sample mission forward so every step can be tried.
      const next: Record<string, string> = { accept: "accepted", decline: "declined", sign: "signed", deliver: "delivered", submit: "submitted" };
      setGifting((g) =>
        g ? { ...g, missions: g.missions.map((m) => (m.id === missionId ? { ...m, status: next[String(action.type)] ?? m.status } : m)) } : g,
      );
      return true;
    }
    try {
      const res = await fetch("/api/gifting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "act", missionId, action }),
      });
      if (!res.ok) return false;
      await loadGifting();
      return true;
    } catch {
      return false;
    }
  };

  const uploadVideo = async (missionId: string, file: File, onProgress: (p: number) => void): Promise<boolean> => {
    if (PREVIEW) {
      for (let p = 0; p <= 100; p += 20) {
        onProgress(p);
        await new Promise((r) => setTimeout(r, 160));
      }
      return act(missionId, { type: "submit" });
    }
    try {
      const res = await fetch("/api/gifting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "upload_url", missionId, contentType: file.type, size: file.size }),
      });
      const ticket = await res.json().catch(() => ({}));
      if (!res.ok || !ticket.path || !ticket.token) return false;
      await uploadGiftVideoResumable(file, ticket.path, ticket.token, onProgress);
      return act(missionId, { type: "submit", videoName: file.name, storagePath: ticket.path });
    } catch {
      return false;
    }
  };

  const pendingPayout = payoutLoaded && !payout && Boolean(stats?.linked);

  useEffect(() => {
    document.title = lang === "fr" ? "Trackit Créateurs" : "Trackit Creators";
  }, [lang]);

  // Dark page behind the app too (overscroll, safe areas).
  useEffect(() => {
    const html = document.documentElement.style.background;
    const body = document.body.style.background;
    document.documentElement.style.background = "#0a0a0c";
    document.body.style.background = "#0a0a0c";
    return () => {
      document.documentElement.style.background = html;
      document.body.style.background = body;
    };
  }, []);

  return (
    <div className="ca" data-lang={lang}>
      <header className="ca-top">
        <div className="ca-top__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/trackit-mark.svg" alt="Trackit" width={26} height={26} />
          <span>{lang === "fr" ? "Créateurs" : "Creators"}</span>
        </div>
        <LangSwitch lang={lang} />
        <button type="button" className="ca-top__me" onClick={() => setTab("profile")} aria-label={t.tabs.profile}>
          <Avatar url={avatarUrl} size={34} />
        </button>
      </header>

      <main className="ca-main">
        {PREVIEW ? <p className="ca-preview">{t.sampleNote}</p> : null}

        {tab === "home" ? (
          <div className="ca-view" key="home">
            <div className="ca-hello">
              <h1>{t.hello(first)}</h1>
              <p>{t.missionsOngoing(active.length)}</p>
            </div>

            <section className="ca-card ca-earn">
              <div className="ca-card__row">
                <span className="ca-label">
                  <Icon d={I.earnings} size={17} /> {t.earningsTitle}
                </span>
                {stats?.linked && stats.brandName ? <span className="ca-muted">{stats.brandName}</span> : null}
              </div>
              {statsLoading && !stats ? (
                <div className="ca-skeleton" />
              ) : stats?.linked ? (
                <>
                  <div className="ca-big">
                    {f.money(stats.balance)} <small>{t.toReceive}</small>
                  </div>
                  <p className="ca-muted">{t.earnedTotal(f.moneyShort(stats.totalEarned ?? stats.totalCommissions), stats.salesCount)}</p>
                  {link?.code || link?.link ? <ShareRow t={t} code={link.code} url={link.link} /> : null}
                  {pendingPayout ? (
                    <button type="button" className="ca-alert" onClick={() => setTab("earnings")}>
                      <Icon d={I.clock} size={16} /> {t.addPayout}
                      <Icon d={I.arrow} size={16} />
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="ca-muted ca-lead">{t.noBrand}</p>
              )}
            </section>

            <MissionCard t={t} f={f} item={current} onOpen={(id) => setOpenId(id)} onAct={act} />

            {giftError ? (
              <button type="button" className="ca-alert is-error" onClick={() => void loadGifting()}>
                {t.loadError} · {t.retry}
              </button>
            ) : null}

            {stats?.linked ? (
              <details className="ca-fold">
                <summary>
                  {t.latestSales}
                  <Icon d={I.chevron} size={18} />
                </summary>
                <SalesList t={t} f={f} stats={stats} limit={5} />
              </details>
            ) : null}
          </div>
        ) : null}

        {tab === "missions" ? (
          <div className="ca-view" key="missions">
            <h1 className="ca-title">{t.missionsTitle}</h1>
            {missions.length === 0 ? (
              <section className="ca-card">
                <p className="ca-muted ca-lead">{t.missionsEmpty}</p>
              </section>
            ) : (
              <ul className="ca-list">
                {missions.map(({ mission, campaign, stage }) => (
                  <li key={mission.id}>
                    <button type="button" className="ca-row" onClick={() => setOpenId(mission.id)}>
                      <span className={`ca-row__icon${NEEDS_ME.has(stage) ? " is-hot" : stage === "approved" ? " is-done" : ""}`}>
                        <Icon d={stage === "approved" ? I.check : I.gift} size={18} />
                      </span>
                      <span className="ca-row__text">
                        <strong>{campaign?.product || campaign?.name || "—"}</strong>
                        <small>{t.stages[stage]}</small>
                      </span>
                      {NEEDS_ME.has(stage) ? <span className="ca-dot" aria-hidden /> : null}
                      <Icon d={I.arrow} size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "earnings" ? (
          <div className="ca-view" key="earnings">
            <h1 className="ca-title">{t.earningsTab}</h1>
            <section className="ca-card ca-earn">
              {stats?.linked ? (
                <>
                  <div className="ca-big">
                    {f.money(stats.balance)} <small>{t.toReceive}</small>
                  </div>
                  <div className="ca-kpis">
                    <span>
                      <b>{f.moneyShort(stats.totalEarned ?? stats.totalCommissions)}</b>
                      <small>{t.totalEarned}</small>
                    </span>
                    <span>
                      <b>{stats.salesCount}</b>
                      <small>{t.salesCount}</small>
                    </span>
                    <span>
                      <b>{stats.commissionRate != null ? `${stats.commissionRate} %` : "—"}</b>
                      <small>{t.rate}</small>
                    </span>
                  </div>
                  {link?.code || link?.link ? <ShareRow t={t} code={link.code} url={link.link} /> : null}
                </>
              ) : (
                <p className="ca-muted ca-lead">{t.noBrand}</p>
              )}
            </section>
            <PayoutCard t={t} userId={userId} payout={payout} onSaved={setPayout} />
            {stats?.linked ? (
              <section className="ca-card">
                <span className="ca-label">{t.latestSales}</span>
                <SalesList t={t} f={f} stats={stats} limit={20} />
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "profile" ? (
          <div className="ca-view" key="profile">
            <section className="ca-card ca-me">
              <Avatar url={avatarUrl} size={64} />
              <div>
                <strong>{name || username || "—"}</strong>
                {username ? <small>@{username.replace(/^@/, "")}</small> : null}
              </div>
            </section>
            <section className="ca-card">
              <span className="ca-label">{t.language}</span>
              <div className="ca-seg">
                {(["fr", "en"] as const).map((l) => (
                  <button key={l} type="button" className={lang === l ? "is-on" : ""} onClick={() => setAppLang(l)}>
                    {l === "fr" ? "Français" : "English"}
                  </button>
                ))}
              </div>
            </section>
            <section className="ca-card ca-legal">
              {legalLinks(lang).map((l) => (
                <a key={l.key} href={l.href}>
                  {l.label}
                </a>
              ))}
            </section>
            <button type="button" className="ca-btn is-ghost" onClick={onSignOut}>
              <Icon d={I.out} size={18} /> {t.signOut}
            </button>
          </div>
        ) : null}
      </main>

      <nav className="ca-tabs" aria-label="Navigation">
        {(["home", "missions", "earnings", "profile"] as const).map((id) => (
          <button key={id} type="button" className={tab === id ? "is-on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
            <Icon d={I[id]} size={21} />
            <span>{t.tabs[id]}</span>
            {id === "missions" && missions.some((m) => NEEDS_ME.has(m.stage)) ? <i className="ca-dot" aria-hidden /> : null}
          </button>
        ))}
      </nav>

      {open ? (
        <MissionSheet
          key={open.mission.id + open.stage}
          t={t}
          f={f}
          item={open}
          onClose={() => setOpenId(null)}
          onAct={act}
          onUpload={uploadVideo}
        />
      ) : null}
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────
type Fmt = ReturnType<typeof useFormat>;
type Item = { mission: Mission; video?: Video; campaign?: Campaign; stage: MissionStage };

function LangSwitch({ lang }: { lang: "en" | "fr" }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="ca-lang" role="group" aria-label="Language">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={lang === l ? "is-on" : ""}
          onClick={() => {
            setAppLang(l);
            // /fr/dashboard is always French: leave it when switching to English.
            if (l === "en" && pathname.startsWith("/fr/")) router.replace(pathname.slice(3));
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ShareRow({ t, code, url }: { t: CreatorCopy; code: string | null; url: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1600);
    });
  };
  return (
    <div className="ca-share">
      {code ? (
        <button type="button" onClick={() => copy(code)}>
          <small>{t.yourCode}</small>
          <b>{code}</b>
          <span>{copied === code ? <Icon d={I.check} size={15} /> : <Icon d={I.copy} size={15} />}</span>
        </button>
      ) : null}
      {url ? (
        <button type="button" onClick={() => copy(url)}>
          <small>{t.yourLink}</small>
          <b>{url.replace(/^https?:\/\//, "")}</b>
          <span>{copied === url ? <Icon d={I.check} size={15} /> : <Icon d={I.copy} size={15} />}</span>
        </button>
      ) : null}
    </div>
  );
}

function MissionCard({ t, f, item, onOpen, onAct }: { t: CreatorCopy; f: Fmt; item: Item | null; onOpen: (id: string) => void; onAct: (id: string, action: Record<string, unknown>) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  if (!item) {
    return (
      <section className="ca-card">
        <span className="ca-label">
          <Icon d={I.bolt} size={17} /> {t.missionTitle}
        </span>
        <h2 className="ca-h2">{t.noMission}</h2>
        <p className="ca-muted">{t.noMissionText}</p>
      </section>
    );
  }
  const { mission, campaign, stage, video } = item;
  const step = STEP_OF[stage];
  const direct = stage === "shipped";
  const label =
    stage === "invited" ? t.cta.invited : stage === "accepted" ? t.cta.accepted : stage === "shipped" ? t.cta.shipped : stage === "delivered" ? t.cta.delivered : stage === "changes" ? t.cta.changes : t.cta.waiting;
  const note = stage === "signed" ? t.waitingNote.signed : stage === "submitted" ? t.waitingNote.submitted : stage === "approved" ? t.waitingNote.approved : null;

  return (
    <section className="ca-card ca-mission">
      <div className="ca-card__row">
        <span className="ca-label">
          <Icon d={I.bolt} size={17} /> {t.missionTitle}
        </span>
        {stage !== "approved" ? <span className="ca-muted">{t.step(step, 5)}</span> : null}
      </div>
      <h2 className="ca-h2">{campaign?.product || campaign?.name || "—"}</h2>
      <p className="ca-stage">{t.stages[stage]}</p>
      {campaign?.deadline && stage !== "approved" ? (
        <p className="ca-muted ca-inline">
          <Icon d={I.clock} size={15} /> {t.dueBy(f.date(campaign.deadline))}
        </p>
      ) : null}
      <Steps current={step} labels={t.stepsLabels} />
      {stage === "changes" && video?.feedback ? (
        <p className="ca-quote">
          <small>{t.brandFeedback}</small>
          {video.feedback}
        </p>
      ) : null}
      <button
        type="button"
        className={`ca-btn${note ? " is-ghost" : ""}`}
        disabled={busy}
        onClick={async () => {
          if (!direct) return onOpen(mission.id);
          if (!window.confirm(t.deliveredConfirm)) return;
          setBusy(true);
          const ok = await onAct(mission.id, { type: "deliver" });
          setBusy(false);
          if (!ok) window.alert(t.actionError);
        }}
      >
        {label} <Icon d={I.arrow} size={18} />
      </button>
      {note ? <p className="ca-note">{note}</p> : null}
    </section>
  );
}

function MissionSheet({
  t,
  f,
  item,
  onClose,
  onAct,
  onUpload,
}: {
  t: CreatorCopy;
  f: Fmt;
  item: Item;
  onClose: () => void;
  onAct: (id: string, action: Record<string, unknown>) => Promise<boolean>;
  onUpload: (id: string, file: File, onProgress: (p: number) => void) => Promise<boolean>;
}) {
  const { mission, campaign, stage, video } = item;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", line: "", postalCode: "", city: "", country: "France" });
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const run = async (action: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    const ok = await onAct(mission.id, action);
    setBusy(false);
    if (!ok) setError(t.actionError);
    else if (action.type === "decline") onClose();
  };

  const field = (key: keyof typeof form, label: string, autoComplete: string) => (
    <label className="ca-field">
      <span>{label}</span>
      <input required value={form[key]} autoComplete={autoComplete} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} />
    </label>
  );

  return (
    <div className="ca-sheet" role="dialog" aria-modal="true" aria-label={campaign?.product || campaign?.name}>
      <button type="button" className="ca-sheet__backdrop" aria-label={t.close} onClick={onClose} />
      <div className="ca-sheet__panel">
        <div className="ca-sheet__head">
          <div>
            <span className="ca-muted">{campaign?.name}</span>
            <h2 className="ca-h2">{campaign?.product || campaign?.name || "—"}</h2>
          </div>
          <button type="button" className="ca-icon-btn" onClick={onClose} aria-label={t.close}>
            <Icon d={I.close} size={20} />
          </button>
        </div>

        {stage !== "declined" ? <Steps current={STEP_OF[stage]} labels={t.stepsLabels} /> : null}
        <p className="ca-stage">{t.stages[stage]}</p>
        {campaign?.deadline && stage !== "approved" && stage !== "declined" ? (
          <p className="ca-muted ca-inline">
            <Icon d={I.clock} size={15} /> {t.dueBy(f.date(campaign.deadline))}
          </p>
        ) : null}

        {campaign?.brief ? (
          <div className="ca-block">
            <span className="ca-label">{t.brief}</span>
            <p>{campaign.brief}</p>
          </div>
        ) : null}

        {mission.contract_text ? (
          <details className="ca-fold ca-contract" open={stage === "invited" || stage === "accepted"}>
            <summary>
              {t.readContract}
              <Icon d={I.chevron} size={18} />
            </summary>
            <pre>{mission.contract_text}</pre>
          </details>
        ) : null}

        {stage === "changes" && video?.feedback ? (
          <p className="ca-quote">
            <small>{t.brandFeedback}</small>
            {video.feedback}
          </p>
        ) : null}

        {error ? <p className="ca-error">{error}</p> : null}

        {stage === "invited" ? (
          <div className="ca-actions">
            <button type="button" className="ca-btn" disabled={busy} onClick={() => void run({ type: "accept" })}>
              {t.accept} <Icon d={I.arrow} size={18} />
            </button>
            <button type="button" className="ca-btn is-text" disabled={busy} onClick={() => window.confirm(t.declineConfirm) && void run({ type: "decline" })}>
              {t.decline}
            </button>
          </div>
        ) : null}

        {stage === "accepted" ? (
          <form
            className="ca-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run({ type: "sign", name: form.name, consent, address: { ...form } });
            }}
          >
            {field("name", t.fullName, "name")}
            {field("line", t.street, "street-address")}
            <div className="ca-form__two">
              {field("postalCode", t.postalCode, "postal-code")}
              {field("city", t.city, "address-level2")}
            </div>
            {field("country", t.country, "country-name")}
            <label className="ca-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t.consent}</span>
            </label>
            <button type="submit" className="ca-btn" disabled={busy || !consent}>
              {t.sign} <Icon d={I.arrow} size={18} />
            </button>
          </form>
        ) : null}

        {stage === "shipped" ? (
          <div className="ca-actions">
            {mission.carrier || mission.tracking_number ? (
              <p className="ca-muted">
                {mission.carrier} · {mission.tracking_number}
              </p>
            ) : null}
            <button type="button" className="ca-btn" disabled={busy} onClick={() => window.confirm(t.deliveredConfirm) && void run({ type: "deliver" })}>
              {t.cta.shipped} <Icon d={I.arrow} size={18} />
            </button>
          </div>
        ) : null}

        {stage === "delivered" || stage === "changes" ? (
          <form
            className="ca-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!file) return;
              setBusy(true);
              setError("");
              setProgress(0);
              const ok = await onUpload(mission.id, file, setProgress);
              setBusy(false);
              setProgress(null);
              if (!ok) setError(t.actionError);
            }}
          >
            <label className="ca-drop">
              <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Icon d={I.upload} size={26} />
              <strong>{file ? file.name : t.chooseVideo}</strong>
              <small>{t.videoFormats}</small>
            </label>
            {progress !== null ? (
              <div className="ca-progress" aria-label={`${progress} %`}>
                <span style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <button type="submit" className="ca-btn" disabled={busy || !file}>
              {progress !== null ? t.sending(progress) : t.sendVideo} {progress === null ? <Icon d={I.arrow} size={18} /> : null}
            </button>
          </form>
        ) : null}

        {stage === "signed" || stage === "submitted" || stage === "approved" ? (
          <p className="ca-note">{stage === "signed" ? t.waitingNote.signed : stage === "submitted" ? t.waitingNote.submitted : t.waitingNote.approved}</p>
        ) : null}
      </div>
    </div>
  );
}

function SalesList({ t, f, stats, limit }: { t: CreatorCopy; f: Fmt; stats: CreatorStatsData; limit: number }) {
  if (!stats.sales.length) return <p className="ca-muted ca-lead">{t.noSales}</p>;
  return (
    <ul className="ca-sales">
      {stats.sales.slice(0, limit).map((sale) => (
        <li key={sale.id}>
          <span>
            <b>{f.money(sale.orderAmount)}</b>
            <small>{f.shortDate(sale.date)}{sale.brandName ? ` · ${sale.brandName}` : ""}</small>
          </span>
          <em>
            +{f.money(sale.commissionAmount)} <small>{t.commission}</small>
          </em>
        </li>
      ))}
    </ul>
  );
}

function PayoutCard({ t, userId, payout, onSaved }: { t: CreatorCopy; userId?: string; payout: Payout | null; onSaved: (p: Payout) => void }) {
  const [draft, setDraft] = useState<Payout>(payout ?? { method: "paypal", value: "", holder: "", bank: "" });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    if (payout) setDraft(payout);
  }, [payout]);

  const placeholder = draft.method === "paypal" ? t.paypalPlaceholder : draft.method === "revolut" ? t.revolutPlaceholder : t.ibanPlaceholder;

  return (
    <section className="ca-card">
      <span className="ca-label">
        <Icon d={I.earnings} size={17} /> {t.payoutTitle}
      </span>
      <p className="ca-muted">{t.payoutText}</p>
      <form
        className="ca-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("saving");
          if (PREVIEW) {
            onSaved(draft);
            setState("saved");
            return;
          }
          try {
            const res = await fetch("/api/creator/payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, method: draft.method, value: draft.value.trim(), accountHolder: draft.holder.trim(), bankName: draft.bank.trim() }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.ok) throw new Error("save");
            onSaved(draft);
            setState("saved");
          } catch {
            setState("error");
          }
        }}
      >
        <div className="ca-seg" role="radiogroup" aria-label={t.method}>
          {(["paypal", "revolut", "iban"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={draft.method === m} className={draft.method === m ? "is-on" : ""} onClick={() => setDraft((d) => ({ ...d, method: m }))}>
              {m === "paypal" ? "PayPal" : m === "revolut" ? "Revolut" : "IBAN"}
            </button>
          ))}
        </div>
        <label className="ca-field">
          <span>{draft.method === "iban" ? "IBAN" : draft.method === "paypal" ? "PayPal" : "Revolut"}</span>
          <input required value={draft.value} placeholder={placeholder} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} />
        </label>
        {draft.method === "iban" ? (
          <div className="ca-form__two">
            <label className="ca-field">
              <span>{t.holder}</span>
              <input value={draft.holder} onChange={(e) => setDraft((d) => ({ ...d, holder: e.target.value }))} autoComplete="name" />
            </label>
            <label className="ca-field">
              <span>{t.bank}</span>
              <input value={draft.bank} onChange={(e) => setDraft((d) => ({ ...d, bank: e.target.value }))} />
            </label>
          </div>
        ) : null}
        {state === "error" ? <p className="ca-error">{t.saveError}</p> : null}
        <button type="submit" className="ca-btn" disabled={state === "saving" || !draft.value.trim()}>
          {state === "saved" ? (
            <>
              <Icon d={I.check} size={18} /> {t.saved}
            </>
          ) : (
            t.save
          )}
        </button>
      </form>
    </section>
  );
}
