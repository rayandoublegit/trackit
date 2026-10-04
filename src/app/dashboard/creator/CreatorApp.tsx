"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLang } from "@/lib/useLang";
import { setAppLang } from "@/lib/locale-preferences";
import { legalLinks } from "@/lib/legal-links";
import { uploadGiftVideoResumable } from "@/lib/gift-video-upload";
import { PersonGlyph, WorkspaceGlyph } from "@/components/FallbackGlyphs";
import { creatorCopy, type CreatorCopy } from "./creator-copy";
import {
  NEEDS_ME,
  PREVIEW,
  STEP_OF,
  useCreatorData,
  type Brand,
  type CommissionBrand,
  type MissionItem,
  type Model,
  type RpmBrand,
  type Sale,
} from "./creator-data";
import "./creator-app.css";

// Creator side of Trackit: one column, one obvious next action. A creator can
// work with several brands ("My brands"); each brand pays in commission, RPM
// or gifting, and money is only shown where there is money.

type Tab = "home" | "missions" | "earnings" | "profile";
type Payout = { method: "paypal" | "revolut" | "iban"; value: string; holder: string; bank: string };
type Upload = (missionId: string, position: number, file: File, onProgress: (p: number) => void) => Promise<boolean>;
type Act = (missionId: string, action: Record<string, unknown>) => Promise<boolean>;

const BRAND_KEY = "trackit_creator_brand";
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_MAX = 500 * 1024 * 1024;
const PHOTO_MAX = 25 * 1024 * 1024;

// ── Formatting ────────────────────────────────────────────────
function useFormat(lang: "en" | "fr") {
  return useMemo(() => {
    const locale = lang === "fr" ? "fr-FR" : "en-US";
    const euros = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
    const whole = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
    const views = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
    return {
      money: (n: number) => euros.format(n),
      moneyShort: (n: number) => (Math.abs(n) >= 1000 ? whole.format(n) : euros.format(n)),
      views: (n: number) => views.format(n),
      date: (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" }),
      shortDate: (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" }),
    };
  }, [lang]);
}
type Fmt = ReturnType<typeof useFormat>;

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
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  video: <><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="m15.5 10 6-3v10l-6-3" /></>,
  photo: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
};
const MODEL_ICON: Record<Model, ReactNode> = { commission: I.percent, rpm: I.eye, gifting: I.gift };

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

function BrandLogo({ brand, size = 34 }: { brand?: Brand | null; size?: number }) {
  return (
    <span className="ca-logo" style={{ width: size, height: size }}>
      {brand?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" referrerPolicy="no-referrer" />
      ) : brand ? (
        <WorkspaceGlyph size={Math.round(size * 0.5)} />
      ) : (
        <Icon d={I.grid} size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

function ModelChips({ brand, t, f }: { brand: Brand; t: CreatorCopy; f: Fmt }) {
  return (
    <span className="ca-chips">
      {brand.models.map((m) => (
        <span key={m} className={`ca-chip is-${m}`}>
          <Icon d={MODEL_ICON[m]} size={13} />
          {m === "commission" && brand.commissionRate != null
            ? t.rateCommission(brand.commissionRate)
            : m === "rpm" && brand.rpmRate != null
              ? t.rateRpm(f.money(brand.rpmRate))
              : t.model[m]}
        </span>
      ))}
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
  const data = useCreatorData(userId, lang);
  const { brands, stats, rpm, missions } = data;
  const [tab, setTab] = useState<Tab>("home");
  const [brandId, setBrandId] = useState<string>("all");
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [payoutLoaded, setPayoutLoaded] = useState(PREVIEW);
  const first = (name || username || "").trim().split(/\s+/)[0]?.replace(/^@/, "") ?? "";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BRAND_KEY);
      if (saved) setBrandId(saved);
    } catch {
      // storage blocked: all brands
    }
  }, []);
  const pickBrand = (id: string) => {
    setBrandId(id);
    setBrandsOpen(false);
    try {
      localStorage.setItem(BRAND_KEY, id);
    } catch {
      // storage blocked
    }
  };

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

  useEffect(() => {
    if (PREVIEW || !userId) return;
    let cancelled = false;
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

  // What the current brand filter shows.
  const current = brandId === "all" ? null : (brands.find((b) => b.brandId === brandId) ?? null);
  const scope = current ? [current] : brands;
  const inScope = (id: string | null | undefined) => !current || id === current.brandId;
  const commissionRows: CommissionBrand[] = useMemo(() => {
    const byBrand = stats?.byBrand;
    if (byBrand) return byBrand.filter((row) => inScope(row.brandId) && brands.some((b) => b.brandId === row.brandId && b.models.includes("commission")));
    // Older API without per-brand figures: one combined row when a commission brand is in scope.
    if (stats?.linked && scope.some((b) => b.models.includes("commission"))) {
      return [{ brandId: "", brandName: "", commissionRate: null, totalSales: 0, totalCommissions: stats.totalCommissions, balance: stats.balance, totalEarned: stats.totalEarned ?? stats.totalCommissions, salesCount: stats.salesCount }];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, brands, brandId]);
  const rpmRows: RpmBrand[] = useMemo(() => (rpm?.byBrand ?? []).filter((row) => inScope(row.brandId) && brands.some((b) => b.brandId === row.brandId && b.models.includes("rpm"))), [rpm, brands, brandId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sales: Sale[] = (stats?.sales ?? []).filter((s) => !current || !s.brandId || s.brandId === current.brandId);
  const scopedMissions = missions.filter((m) => inScope(m.brandId));
  const active = scopedMissions.filter((m) => m.stage !== "approved" && m.stage !== "declined");
  const currentMission = scopedMissions.find((m) => m.stage !== "declined") ?? null;
  const open = missions.find((m) => m.mission.id === openId) ?? null;
  const moneyAnywhere = brands.some((b) => b.models.includes("commission") || b.models.includes("rpm"));
  const giftingAnywhere = brands.some((b) => b.models.includes("gifting")) || missions.length > 0;
  const hasMoneyHere = commissionRows.length > 0 || rpmRows.length > 0;
  const pendingPayout = payoutLoaded && !payout && moneyAnywhere;

  const tabs: Tab[] = ["home", ...(giftingAnywhere ? (["missions"] as const) : []), ...(moneyAnywhere ? (["earnings"] as const) : []), "profile"];
  useEffect(() => {
    if (!tabs.includes(tab)) setTab("home");
  }, [tabs.join(), tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const act: Act = async (missionId, action) => {
    if (PREVIEW) {
      // Local preview: move the sample mission forward so every step can be tried.
      const next: Record<string, string> = { accept: "accepted", decline: "declined", sign: "signed", deliver: "delivered" };
      data.setGifting((g) => {
        if (!g) return g;
        if (action.type === "submit") {
          const position = Number(action.position) || 1;
          const videos = [
            ...g.videos.filter((v) => !(v.mission_id === missionId && (v.position ?? 1) === position)),
            { mission_id: missionId, position, kind: String(action.kind || "video"), name: String(action.videoName || ""), status: "pending", feedback: "" },
          ];
          const campaign = g.campaigns.find((c) => c.id === g.missions.find((m) => m.id === missionId)?.campaign_id);
          const expected = Math.max(1, Number(campaign?.video_count) || 1);
          const filled = new Set(videos.filter((v) => v.mission_id === missionId).map((v) => v.position ?? 1)).size;
          return { ...g, videos, missions: g.missions.map((m) => (m.id === missionId && filled >= expected ? { ...m, status: "submitted" } : m)) };
        }
        return { ...g, missions: g.missions.map((m) => (m.id === missionId ? { ...m, status: next[String(action.type)] ?? m.status } : m)) };
      });
      return true;
    }
    try {
      const res = await fetch("/api/gifting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "act", missionId, action }),
      });
      if (!res.ok) return false;
      await data.reloadGifting();
      return true;
    } catch {
      return false;
    }
  };

  const upload: Upload = async (missionId, position, file, onProgress) => {
    const kind = file.type.startsWith("image/") ? "photo" : "video";
    if (PREVIEW) {
      for (let p = 0; p <= 100; p += 20) {
        onProgress(p);
        await new Promise((r) => setTimeout(r, 140));
      }
      return act(missionId, { type: "submit", position, kind, videoName: file.name });
    }
    try {
      const res = await fetch("/api/gifting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "upload_url", missionId, position, contentType: file.type, size: file.size }),
      });
      const ticket = await res.json().catch(() => ({}));
      if (!res.ok || !ticket.path || !ticket.token) return false;
      await uploadGiftVideoResumable(file, ticket.path, ticket.token, onProgress);
      return act(missionId, { type: "submit", position, kind, videoName: file.name, storagePath: ticket.path });
    } catch {
      return false;
    }
  };

  const brandLabel = current ? current.brandName : t.allBrands;

  return (
    <div className="ca" data-lang={lang}>
      <header className="ca-top">
        <button type="button" className="ca-switch" onClick={() => setBrandsOpen(true)} aria-haspopup="dialog">
          <BrandLogo brand={current} size={30} />
          <span className="ca-switch__text">
            <small>{t.myBrands}</small>
            <b>{brandLabel}</b>
          </span>
          <Icon d={I.chevron} size={16} />
        </button>
        <LangSwitch lang={lang} />
        <button type="button" className="ca-top__me" onClick={() => setTab("profile")} aria-label={t.tabs.profile}>
          <Avatar url={avatarUrl} size={34} />
        </button>
      </header>

      <main className="ca-main">
        {PREVIEW ? <p className="ca-preview">{t.sampleNote}</p> : null}

        {tab === "home" ? (
          <div className="ca-view" key={`home-${brandId}`}>
            <div className="ca-hello">
              <h1>{t.hello(first)}</h1>
              <p>
                {t.missionsOngoing(active.length)}
                {!current && brands.length > 0 ? ` · ${t.brandsCount(brands.length)}` : ""}
              </p>
            </div>

            {current ? (
              <section className="ca-card ca-brand">
                <BrandLogo brand={current} size={46} />
                <div>
                  <strong>{current.brandName}</strong>
                  <ModelChips brand={current} t={t} f={f} />
                </div>
              </section>
            ) : null}

            {hasMoneyHere ? (
              <MoneyCard t={t} f={f} brands={brands} commission={commissionRows} rpm={rpmRows} single={Boolean(current)} />
            ) : null}
            {hasMoneyHere && current?.models.includes("commission") && (current.discountCode || current.affiliateLink) ? (
              <ShareRow t={t} code={current.discountCode} url={current.affiliateLink} />
            ) : null}
            {hasMoneyHere && pendingPayout ? (
              <button type="button" className="ca-alert" onClick={() => setTab("earnings")}>
                <Icon d={I.clock} size={16} /> {t.addPayout}
                <Icon d={I.arrow} size={16} />
              </button>
            ) : null}

            {current && !hasMoneyHere && current.models.length === 1 && current.models[0] === "gifting" && scopedMissions.length === 0 ? (
              <section className="ca-card">
                <p className="ca-muted ca-lead">{t.giftingOnly}</p>
              </section>
            ) : null}

            {giftingAnywhere || !hasMoneyHere ? (
              <MissionCard t={t} f={f} item={currentMission} showBrand={!current} onOpen={setOpenId} onAct={act} />
            ) : null}

            {data.brandsLoaded && brands.length === 0 && !PREVIEW ? (
              <section className="ca-card">
                <p className="ca-muted ca-lead">{t.noBrands}</p>
              </section>
            ) : null}

            {data.error ? (
              <button type="button" className="ca-alert is-error" onClick={() => void data.reload()}>
                {t.loadError} · {t.retry}
              </button>
            ) : null}

            {commissionRows.length > 0 ? (
              <details className="ca-fold">
                <summary>
                  {t.latestSales}
                  <Icon d={I.chevron} size={18} />
                </summary>
                <SalesList t={t} f={f} sales={sales} limit={5} showBrand={!current} />
              </details>
            ) : null}
          </div>
        ) : null}

        {tab === "missions" ? (
          <div className="ca-view" key={`missions-${brandId}`}>
            <h1 className="ca-title">{t.missionsTitle}</h1>
            {scopedMissions.length === 0 ? (
              <section className="ca-card">
                <p className="ca-muted ca-lead">{t.missionsEmpty}</p>
              </section>
            ) : (
              <ul className="ca-list">
                {scopedMissions.map((item) => (
                  <li key={item.mission.id}>
                    <button type="button" className="ca-row" onClick={() => setOpenId(item.mission.id)}>
                      <span className={`ca-row__icon${NEEDS_ME.has(item.stage) ? " is-hot" : item.stage === "approved" ? " is-done" : ""}`}>
                        <Icon d={item.stage === "approved" ? I.check : I.gift} size={18} />
                      </span>
                      <span className="ca-row__text">
                        <strong>{item.campaign?.product || item.campaign?.name || "—"}</strong>
                        <small>
                          {!current && item.brandName ? `${item.brandName} · ` : ""}
                          {item.stage === "delivered" || item.stage === "changes" ? t.contentsProgress(item.sent, item.expected) : t.stages[item.stage]}
                        </small>
                      </span>
                      {NEEDS_ME.has(item.stage) ? <span className="ca-dot" aria-hidden /> : null}
                      <Icon d={I.arrow} size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "earnings" ? (
          <div className="ca-view" key={`earnings-${brandId}`}>
            <h1 className="ca-title">{t.earningsTab}</h1>
            {hasMoneyHere ? (
              <MoneyCard t={t} f={f} brands={brands} commission={commissionRows} rpm={rpmRows} single={Boolean(current)} detailed />
            ) : (
              <section className="ca-card">
                <p className="ca-muted ca-lead">{t.noMoney}</p>
              </section>
            )}
            {scope
              .filter((b) => b.models.includes("commission") && (b.discountCode || b.affiliateLink))
              .map((b) => (
                <ShareRow key={b.brandId} t={t} code={b.discountCode} url={b.affiliateLink} brandName={current ? undefined : b.brandName} />
              ))}
            <PayoutCard t={t} userId={userId} payout={payout} onSaved={setPayout} />
            {commissionRows.length > 0 ? (
              <section className="ca-card">
                <span className="ca-label">{t.latestSales}</span>
                <SalesList t={t} f={f} sales={sales} limit={20} showBrand={!current} />
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
            {brands.length > 0 ? (
              <section className="ca-card">
                <span className="ca-label">{t.myBrands}</span>
                <ul className="ca-brandlist">
                  {brands.map((b) => (
                    <li key={b.brandId}>
                      <BrandLogo brand={b} size={36} />
                      <span>
                        <strong>{b.brandName}</strong>
                        <ModelChips brand={b} t={t} f={f} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
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

      <nav className="ca-tabs" aria-label="Navigation" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((id) => (
          <button key={id} type="button" className={tab === id ? "is-on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
            <Icon d={I[id]} size={21} />
            <span>{t.tabs[id]}</span>
            {id === "missions" && missions.some((m) => NEEDS_ME.has(m.stage)) ? <i className="ca-dot" aria-hidden /> : null}
          </button>
        ))}
      </nav>

      {brandsOpen ? (
        <Sheet label={t.myBrands} onClose={() => setBrandsOpen(false)} closeLabel={t.close}>
          <h2 className="ca-h2">{t.myBrands}</h2>
          <ul className="ca-brandlist is-pick">
            <li>
              <button type="button" className={brandId === "all" ? "is-on" : ""} onClick={() => pickBrand("all")}>
                <BrandLogo brand={null} size={40} />
                <span>
                  <strong>{t.allBrands}</strong>
                  <small className="ca-muted">{t.brandsCount(brands.length)}</small>
                </span>
                {brandId === "all" ? <Icon d={I.check} size={18} /> : null}
              </button>
            </li>
            {brands.map((b) => (
              <li key={b.brandId}>
                <button type="button" className={brandId === b.brandId ? "is-on" : ""} onClick={() => pickBrand(b.brandId)}>
                  <BrandLogo brand={b} size={40} />
                  <span>
                    <strong>{b.brandName}</strong>
                    <ModelChips brand={b} t={t} f={f} />
                  </span>
                  {brandId === b.brandId ? <Icon d={I.check} size={18} /> : null}
                </button>
              </li>
            ))}
          </ul>
          {brands.length === 0 ? <p className="ca-muted">{t.noBrands}</p> : null}
        </Sheet>
      ) : null}

      {open ? (
        <MissionSheet key={open.mission.id + open.stage} t={t} f={f} item={open} onClose={() => setOpenId(null)} onAct={act} onUpload={upload} />
      ) : null}
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────
function LangSwitch({ lang }: { lang: "en" | "fr" }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="ca-lang" role="group" aria-label={lang === "fr" ? "Langue" : "Language"}>
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

function Sheet({ label, onClose, closeLabel, children }: { label?: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="ca-sheet" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="ca-sheet__backdrop" aria-label={closeLabel} onClick={onClose} />
      <div className="ca-sheet__panel">
        <button type="button" className="ca-icon-btn ca-sheet__close" onClick={onClose} aria-label={closeLabel}>
          <Icon d={I.close} size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

/** Commission and RPM money for the brands in view. Gifting never shows money. */
function MoneyCard({
  t,
  f,
  brands,
  commission,
  rpm,
  single,
  detailed,
}: {
  t: CreatorCopy;
  f: Fmt;
  brands: Brand[];
  commission: CommissionBrand[];
  rpm: RpmBrand[];
  single: boolean;
  detailed?: boolean;
}) {
  const toReceive = commission.reduce((s, r) => s + r.balance, 0) + rpm.reduce((s, r) => s + r.accrued, 0);
  const commissionEarned = commission.reduce((s, r) => s + r.totalEarned, 0);
  const salesCount = commission.reduce((s, r) => s + r.salesCount, 0);
  const views = rpm.reduce((s, r) => s + r.views, 0);
  const videos = rpm.reduce((s, r) => s + r.videos, 0);
  const pending = rpm.reduce((s, r) => s + r.pending, 0);
  const onlyRpm = commission.length === 0;
  const onlyCommission = rpm.length === 0;
  const lines = [
    ...commission.map((r) => ({ id: `c-${r.brandId}`, brand: brands.find((b) => b.brandId === r.brandId), model: "commission" as const, amount: r.balance, note: t.earnedTotal(f.moneyShort(r.totalEarned), r.salesCount) })),
    ...rpm.map((r) => ({ id: `r-${r.brandId}`, brand: brands.find((b) => b.brandId === r.brandId), model: "rpm" as const, amount: r.accrued, note: t.rpmLine(f.views(r.views), r.videos) })),
  ];

  return (
    <section className="ca-card ca-earn">
      <div className="ca-card__row">
        <span className="ca-label">
          <Icon d={onlyRpm ? I.eye : I.earnings} size={17} /> {onlyRpm ? t.rpmTitle : onlyCommission ? t.commissionTitle : t.earningsTab}
        </span>
      </div>
      <div className="ca-big">
        {f.money(toReceive)} <small>{t.toReceive}</small>
      </div>
      {onlyCommission ? <p className="ca-muted">{t.earnedTotal(f.moneyShort(commissionEarned), salesCount)}</p> : null}
      {onlyRpm ? (
        <p className="ca-muted">
          {t.rpmLine(f.views(views), videos)}
          {pending > 0 ? ` · ${t.pendingViews(f.money(pending))}` : ""}
        </p>
      ) : null}
      {detailed && single && commission[0] ? (
        <div className="ca-kpis">
          <span>
            <b>{f.moneyShort(commission[0].totalEarned)}</b>
            <small>{t.totalEarned}</small>
          </span>
          <span>
            <b>{commission[0].salesCount}</b>
            <small>{t.salesCount}</small>
          </span>
          <span>
            <b>{commission[0].commissionRate != null ? `${commission[0].commissionRate} %` : "—"}</b>
            <small>{t.rate}</small>
          </span>
        </div>
      ) : null}
      {detailed && single && rpm[0] ? (
        <div className="ca-kpis">
          <span>
            <b>{f.views(rpm[0].views)}</b>
            <small>{t.views}</small>
          </span>
          <span>
            <b>{rpm[0].videos}</b>
            <small>{t.videos}</small>
          </span>
          <span>
            <b>{f.money(rpm[0].rpmRate)}</b>
            <small>{t.perThousand}</small>
          </span>
        </div>
      ) : null}
      {!single && lines.length > 1 ? (
        <ul className="ca-brandmoney">
          {lines.map((l) => (
            <li key={l.id}>
              <BrandLogo brand={l.brand} size={30} />
              <span>
                <strong>{l.brand?.brandName ?? "—"}</strong>
                <small>
                  {t.model[l.model]} · {l.note}
                </small>
              </span>
              <b>{f.money(l.amount)}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ShareRow({ t, code, url, brandName }: { t: CreatorCopy; code: string | null; url: string | null; brandName?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1600);
    });
  };
  return (
    <div className="ca-share">
      {brandName ? <span className="ca-muted ca-share__brand">{brandName}</span> : null}
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

function MissionCard({ t, f, item, showBrand, onOpen, onAct }: { t: CreatorCopy; f: Fmt; item: MissionItem | null; showBrand: boolean; onOpen: (id: string) => void; onAct: Act }) {
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
  const { mission, campaign, stage } = item;
  const step = STEP_OF[stage];
  const direct = stage === "shipped";
  const label =
    stage === "invited" ? t.cta.invited : stage === "accepted" ? t.cta.accepted : stage === "shipped" ? t.cta.shipped : stage === "delivered" ? t.cta.delivered : stage === "changes" ? t.cta.changes : t.cta.waiting;
  const note = stage === "signed" ? t.waitingNote.signed : stage === "submitted" ? t.waitingNote.submitted : stage === "approved" ? t.waitingNote.approved : null;
  const showSlots = stage === "delivered" || stage === "changes" || stage === "submitted";

  return (
    <section className="ca-card ca-mission">
      <div className="ca-card__row">
        <span className="ca-label">
          <Icon d={I.bolt} size={17} /> {t.missionTitle}
        </span>
        {stage !== "approved" ? <span className="ca-muted">{t.step(step, 5)}</span> : null}
      </div>
      {showBrand && item.brandName ? <span className="ca-muted">{item.brandName}</span> : null}
      <h2 className="ca-h2">{campaign?.product || campaign?.name || "—"}</h2>
      <p className="ca-stage">{t.stages[stage]}</p>
      {campaign?.deadline && stage !== "approved" ? (
        <p className="ca-muted ca-inline">
          <Icon d={I.clock} size={15} /> {t.dueBy(f.date(campaign.deadline))}
        </p>
      ) : null}
      <Steps current={step} labels={t.stepsLabels} />
      {showSlots ? (
        <div className="ca-progress-row">
          <span>{t.contentsProgress(item.sent, item.expected)}</span>
          <span className="ca-dots">
            {item.slots.map((s) => (
              <i key={s.position} className={`is-${s.status}`} />
            ))}
          </span>
        </div>
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

function MissionSheet({ t, f, item, onClose, onAct, onUpload }: { t: CreatorCopy; f: Fmt; item: MissionItem; onClose: () => void; onAct: Act; onUpload: Upload }) {
  const { mission, campaign, stage } = item;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", line: "", postalCode: "", city: "", country: "France" });
  const [consent, setConsent] = useState(false);

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

  const contentStage = stage === "delivered" || stage === "changes" || stage === "submitted" || stage === "approved";

  return (
    <Sheet label={campaign?.product || campaign?.name} onClose={onClose} closeLabel={t.close}>
      <div className="ca-sheet__head">
        <span className="ca-muted">
          {item.brandName ? `${item.brandName} · ` : ""}
          {campaign?.name}
        </span>
        <h2 className="ca-h2">{campaign?.product || campaign?.name || "—"}</h2>
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

      {contentStage ? <ContentSpace t={t} item={item} onUpload={onUpload} /> : null}

      {mission.contract_text ? (
        <details className="ca-fold ca-contract" open={stage === "invited" || stage === "accepted"}>
          <summary>
            {t.readContract}
            <Icon d={I.chevron} size={18} />
          </summary>
          <pre>{mission.contract_text}</pre>
        </details>
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

      {stage === "signed" || stage === "submitted" || stage === "approved" ? (
        <p className="ca-note">{stage === "signed" ? t.waitingNote.signed : stage === "submitted" ? t.waitingNote.submitted : t.waitingNote.approved}</p>
      ) : null}
    </Sheet>
  );
}

/** One slot per expected content: send, see the review, redo when asked. */
function ContentSpace({ t, item, onUpload }: { t: CreatorCopy; item: MissionItem; onUpload: Upload }) {
  return (
    <div className="ca-content">
      <div className="ca-content__head">
        <span className="ca-label">
          <Icon d={I.upload} size={17} /> {t.contentTitle}
        </span>
        <span className="ca-muted">{t.contentsProgress(item.sent, item.expected)}</span>
      </div>
      <p className="ca-muted">{t.contentText(item.expected)}</p>
      <ul className="ca-slots">
        {item.slots.map((slot) => (
          <SlotRow key={slot.position} t={t} missionId={item.mission.id} slot={slot} locked={item.stage === "approved"} onUpload={onUpload} />
        ))}
      </ul>
    </div>
  );
}

function SlotRow({ t, missionId, slot, locked, onUpload }: { t: CreatorCopy; missionId: string; slot: MissionItem["slots"][number]; locked: boolean; onUpload: Upload }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const canSend = !locked && (slot.status === "empty" || slot.status === "changes_requested" || slot.status === "pending");
  const kind = slot.content?.kind === "photo" ? "photo" : "video";

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    const isVideo = VIDEO_TYPES.includes(file.type);
    const isPhoto = PHOTO_TYPES.includes(file.type);
    if (!isVideo && !isPhoto) return setError(t.fileType);
    if (file.size > (isVideo ? VIDEO_MAX : PHOTO_MAX)) return setError(t.fileTooBig);
    setProgress(0);
    const ok = await onUpload(missionId, slot.position, file, setProgress);
    setProgress(null);
    if (!ok) setError(t.actionError);
  };

  return (
    <li className={`ca-slot is-${slot.status}`}>
      <span className="ca-slot__icon">
        <Icon d={slot.status === "approved" ? I.check : slot.content ? (kind === "photo" ? I.photo : I.video) : I.upload} size={18} />
      </span>
      <span className="ca-slot__text">
        <strong>{t.slot(slot.position)}</strong>
        <small>{slot.content ? slot.content.name : t.formats}</small>
        {slot.status === "changes_requested" && slot.content?.feedback ? (
          <em>
            {t.brandFeedback} : {slot.content.feedback}
          </em>
        ) : null}
        {progress !== null ? (
          <span className="ca-progress" aria-label={`${progress} %`}>
            <span style={{ width: `${progress}%` }} />
          </span>
        ) : null}
        {error ? <span className="ca-error">{error}</span> : null}
      </span>
      <span className={`ca-pill is-${slot.status}`}>{progress !== null ? t.sending(progress) : t.slotStatus[slot.status]}</span>
      {canSend && progress === null ? (
        <label className={`ca-slot__pick${slot.status === "empty" || slot.status === "changes_requested" ? " is-primary" : ""}`}>
          <input type="file" accept={[...VIDEO_TYPES, ...PHOTO_TYPES].join(",")} onChange={(e) => void pick(e.target.files?.[0])} />
          {slot.status === "empty" ? t.send : t.replaceFile}
        </label>
      ) : null}
    </li>
  );
}

function SalesList({ t, f, sales, limit, showBrand }: { t: CreatorCopy; f: Fmt; sales: Sale[]; limit: number; showBrand: boolean }) {
  if (!sales.length) return <p className="ca-muted ca-lead">{t.noSales}</p>;
  return (
    <ul className="ca-sales">
      {sales.slice(0, limit).map((sale) => (
        <li key={sale.id}>
          <span>
            <b>{f.money(sale.orderAmount)}</b>
            <small>
              {f.shortDate(sale.date)}
              {showBrand && sale.brandName ? ` · ${sale.brandName}` : ""}
            </small>
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
