"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import type { Lang } from "@/lib/useLang";
import { demoBrands, demoGifting, demoRpm, demoStats } from "./creator-demo";
import type { MissionStage, SlotStatus } from "./creator-copy";

// Everything the creator app reads, per brand. A brand works with the creator
// in commission, RPM and/or gifting; money is shown only where it exists.

// Demo data (creator-demo.ts) only in local dev with the plan bypass: a stray
// NEXT_PUBLIC_DEV_BYPASS_PLAN in a production build must never show it.
export const PREVIEW = Boolean(DEV_BYPASS_PLAN) && process.env.NODE_ENV !== "production";

export type Model = "commission" | "rpm" | "gifting";

export type Brand = {
  brandId: string;
  brandName: string;
  logoUrl: string | null;
  models: Model[];
  commissionRate: number | null;
  rpmRate: number | null;
  discountCode: string | null;
  affiliateLink: string | null;
};

export type Sale = { id: string; orderAmount: number; commissionAmount: number; date: string; brandName?: string | null; brandId?: string | null };

export type CommissionBrand = {
  brandId: string;
  brandName: string;
  commissionRate: number | null;
  totalSales: number;
  totalCommissions: number;
  balance: number;
  totalEarned: number;
  salesCount: number;
};

export type Stats = { linked: boolean; balance: number; totalEarned?: number; totalCommissions: number; salesCount: number; sales: Sale[]; byBrand?: CommissionBrand[] };

export type RpmBrand = { brandId: string; brandName: string; views: number; accrued: number; pending: number; videos: number; rpmRate: number };
export type Rpm = { totals?: { views: number; accrued: number; pending: number; videos: number }; byBrand?: RpmBrand[] };

export type Campaign = {
  id: string;
  name: string;
  product: string;
  deadline: string;
  video_count?: number;
  brief?: string;
  brand_id?: string;
  brand_name?: string;
};
export type Mission = {
  id: string;
  campaign_id: string;
  user_id?: string;
  status: string;
  contract_text: string;
  signed_name: string | null;
  carrier: string | null;
  tracking_number: string | null;
};
export type Content = { mission_id: string; position?: number; kind?: string; name: string; status: string; feedback: string };
export type Gifting = { campaigns: Campaign[]; missions: Mission[]; videos: Content[] };

export type Slot = { position: number; status: SlotStatus; content?: Content };
export type MissionItem = {
  mission: Mission;
  campaign?: Campaign;
  brandId: string;
  brandName: string;
  stage: MissionStage;
  expected: number;
  slots: Slot[];
  sent: number;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) return null;
    return body as T;
  } catch {
    return null;
  }
}

function slotsOf(mission: Mission, expected: number, contents: Content[]): Slot[] {
  return Array.from({ length: expected }, (_, i) => {
    const position = i + 1;
    const content = contents.find((c) => (c.position ?? 1) === position);
    const status: SlotStatus = !content ? "empty" : content.status === "approved" ? "approved" : content.status === "changes_requested" ? "changes_requested" : "pending";
    return { position, status, content };
  });
}

function stageOf(mission: Mission, slots: Slot[]): MissionStage {
  if (slots.some((s) => s.status === "changes_requested")) return "changes";
  const known: MissionStage[] = ["invited", "accepted", "signed", "shipped", "delivered", "submitted", "approved", "declined"];
  return known.includes(mission.status as MissionStage) ? (mission.status as MissionStage) : "signed";
}

// Creator has something to do first, then waiting on the brand, then done.
export const PRIORITY: Record<MissionStage, number> = { invited: 0, accepted: 0, shipped: 0, delivered: 0, changes: 0, signed: 1, submitted: 1, approved: 2, declined: 3 };
export const NEEDS_ME = new Set<MissionStage>(["invited", "accepted", "shipped", "delivered", "changes"]);
export const STEP_OF: Record<MissionStage, number> = { invited: 1, accepted: 2, signed: 3, shipped: 3, delivered: 4, changes: 4, submitted: 4, approved: 5, declined: 0 };

export function useCreatorData(userId: string | undefined, lang: Lang) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rpm, setRpm] = useState<Rpm | null>(null);
  const [gifting, setGifting] = useState<Gifting | null>(null);
  const [error, setError] = useState(false);

  const loadGifting = useCallback(async () => {
    if (PREVIEW) return;
    const body = await getJson<Gifting>("/api/gifting");
    if (body) setGifting({ campaigns: body.campaigns ?? [], missions: body.missions ?? [], videos: body.videos ?? [] });
    else {
      setError(true);
      setGifting((g) => g ?? { campaigns: [], missions: [], videos: [] });
    }
  }, []);

  const load = useCallback(async () => {
    setError(false);
    if (PREVIEW) {
      setBrands(demoBrands(lang));
      setStats(demoStats());
      setRpm(demoRpm());
      setGifting((g) => g ?? demoGifting(lang));
      return;
    }
    if (!userId) return;
    const q = `userId=${encodeURIComponent(userId)}`;
    const [b, s, r] = await Promise.all([
      getJson<{ ok?: boolean; brands?: Brand[] }>(`/api/creator/brands?${q}`),
      getJson<Stats & { ok?: boolean }>(`/api/creator/stats?${q}`),
      getJson<Rpm & { ok?: boolean }>(`/api/creator/rpm?${q}&refresh=0`),
      loadGifting(),
    ]);
    setBrands(b?.brands ?? []);
    setStats(s && s.ok !== false ? s : null);
    setRpm(r ?? null);
    if (!b) setError(true);
  }, [userId, lang, loadGifting]);

  useEffect(() => {
    void load();
  }, [load]);

  // Gift missions, each with its brand and its content slots.
  const missions: MissionItem[] = useMemo(() => {
    if (!gifting) return [];
    return gifting.missions
      .map((mission) => {
        const campaign = gifting.campaigns.find((c) => c.id === mission.campaign_id);
        const expected = Math.max(1, Number(campaign?.video_count) || 1);
        const contents = gifting.videos.filter((v) => v.mission_id === mission.id);
        const slots = slotsOf(mission, expected, contents);
        const brandId = campaign?.brand_id || mission.user_id || "";
        const brandName = campaign?.brand_name || brands?.find((b) => b.brandId === brandId)?.brandName || "";
        return { mission, campaign, brandId, brandName, stage: stageOf(mission, slots), expected, slots, sent: slots.filter((s) => s.status !== "empty").length };
      })
      .sort((a, b) => PRIORITY[a.stage] - PRIORITY[b.stage]);
  }, [gifting, brands]);

  // Brands: API list, plus any brand only seen through gift missions.
  const allBrands: Brand[] = useMemo(() => {
    const list = [...(brands ?? [])];
    for (const m of missions) {
      if (!m.brandId) continue;
      const found = list.find((b) => b.brandId === m.brandId);
      if (found) {
        if (!found.models.includes("gifting")) found.models = [...found.models, "gifting"];
      } else {
        list.push({ brandId: m.brandId, brandName: m.brandName, logoUrl: null, models: ["gifting"], commissionRate: null, rpmRate: null, discountCode: null, affiliateLink: null });
      }
    }
    return list;
  }, [brands, missions]);

  return { brands: allBrands, brandsLoaded: brands !== null, stats, rpm, gifting, setGifting, missions, error, reload: load, reloadGifting: loadGifting };
}
