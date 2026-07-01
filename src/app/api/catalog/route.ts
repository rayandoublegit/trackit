import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  catalogRowToFeedCreator,
  nicheCatalogOrClause,
  type FeedCreator,
} from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

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

type CreatorsIndexQuery = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

async function fetchAllRows(
  build: () => CreatorsIndexQuery,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await build().range(from, to);
    if (error) break;
    const batch = (data || []) as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * /api/catalog -- source de verite unique pour Find It.
 * Filtres: niche (+ sous-niches + primary_niche), langue et/ou pays.
 * Aucun filtre qualite/enrichment: tous les createurs indexes sortent.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const niche = p.get("niche") || undefined;
  const language = p.get("language") || undefined;
  const country = (p.get("country") || "").trim().toUpperCase() || undefined;
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
    const build = () => {
      let q = admin.from("creators_index").select("*");
      if (language && country) {
        q = q.or(`language.eq.${language},country_code.eq.${country}`);
      } else if (language) {
        q = q.eq("language", language);
      } else if (country) {
        q = q.eq("country_code", country);
      }
      if (niche) {
        const or = nicheCatalogOrClause(niche);
        if (or) q = q.or(or);
      }
      return q;
    };

    const data = await fetchAllRows(build);

    const pageSeed = (Math.floor(offset / limit) + 1) * 7919;
    const shuffled = seededShuffle(data, pageSeed);

    const slice = shuffled.slice(offset, offset + limit);
    const creators: FeedCreator[] = slice.map(catalogRowToFeedCreator);
    const hasMore = offset + limit < shuffled.length;

    return NextResponse.json({
      creators,
      hasMore,
      count: creators.length,
      total: shuffled.length,
    });
  } catch (e) {
    return NextResponse.json({
      creators: [],
      hasMore: false,
      count: 0,
      error: e instanceof Error ? e.message : "catalog failed",
    });
  }
}
