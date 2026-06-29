import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NICHE_TREE } from "@/lib/niche-tree";
import {
  catalogRowToFeedCreator,
  resolveNicheKey,
  type FeedCreator,
} from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Tags valides pour une niche: tag canonique + sous-niches (array-only, propre).
function nicheTags(label: string): string[] {
  const key = resolveNicheKey(label);
  if (!key) return [];
  const subs = NICHE_TREE[key] ?? [];
  return [...new Set([key, ...subs])].filter((t) => /^[a-z0-9]+$/i.test(t));
}

// Shuffle deterministe par seed (meme page = meme ordre; page suivante = autre ordre).
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * /api/catalog -- LA route catalogue, source de verite unique.
 * Filtres: niche (+ sous-niches) ET langue. RIEN d'autre.
 * Pas de country, pas de score, pas de quality_status. Tout sort.
 * Cures et scrapes melanges (shuffle). Pagination offset/limit.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const niche = p.get("niche") || undefined;
  const language = p.get("language") || undefined;
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const maxLimit = niche ? 50 : 1000;
  const defaultLimit = niche ? 25 : 1000;
  const limit = Math.min(maxLimit, Math.max(1, Number(p.get("limit")) || defaultLimit));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ creators: [], hasMore: false, count: 0, error: "no db" });
  }
  const admin = createClient(url, key);

  try {
    let q = admin.from("creators_index").select("*");
    if (language) q = q.eq("language", language);
    if (niche) {
      const tags = nicheTags(niche);
      if (tags.length) q = q.or(tags.map((t) => `niches.cs.{${t}}`).join(","));
    }
    // Catalogue par niche+langue tient largement sous 1000.
    const { data, error } = await q.limit(1000);
    if (error || !data) {
      return NextResponse.json({ creators: [], hasMore: false, count: 0, error: error?.message || "query failed" });
    }

    // Shuffle stable par page: meme page -> meme ordre; Relancer (page+1) -> autre.
    const pageSeed = (Math.floor(offset / limit) + 1) * 7919;
    const shuffled = seededShuffle(data, pageSeed);

    const slice = shuffled.slice(offset, offset + limit);
    const creators: FeedCreator[] = slice.map(catalogRowToFeedCreator);
    const hasMore = offset + limit < shuffled.length;

    return NextResponse.json({ creators, hasMore, count: creators.length, total: shuffled.length });
  } catch (e) {
    return NextResponse.json({ creators: [], hasMore: false, count: 0, error: e instanceof Error ? e.message : "catalog failed" });
  }
}
