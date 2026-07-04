import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  catalogRowToFeedCreator,
  CREATOR_LIST_COLUMNS,
  creatorMatchesNicheFilter,
  nicheOrClause,
  type FeedCreator,
} from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Light shuffle of the current page only (no full-table load).
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
 * /api/catalog — Find It feed.
 * Paginated at the DB (no full-table scan). Niche filter uses GIN array tags only.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const niche = p.get("niche") || undefined;
  const language = p.get("language") || undefined;
  const country = (p.get("country") || "").trim().toUpperCase() || undefined;
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const maxLimit = niche ? 50 : 100;
  const defaultLimit = niche ? 25 : 48;
  const limit = Math.min(maxLimit, Math.max(1, Number(p.get("limit")) || defaultLimit));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ creators: [], hasMore: false, count: 0, error: "no db" });
  }
  const admin = createClient(url, key);

  try {
    // Fetch limit+1 to know hasMore without counting the whole table.
    const from = offset;
    const to = offset + limit; // inclusive → limit+1 rows

    let q = admin
      .from("creators_index")
      .select(CREATOR_LIST_COLUMNS)
      .order("followers", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (language && country) {
      // Language is strict (a creator has ONE content language). Country narrows within it.
      q = q.eq("language", language);
    } else if (language) {
      q = q.eq("language", language);
    } else if (country) {
      q = q.eq("country_code", country);
    }

    if (niche) {
      const or = nicheOrClause(niche);
      if (or) q = q.or(or);
    }

    // Curated picks: hand-added creators always surface on the first page,
    // regardless of follower count.
    let curatedRows: Record<string, unknown>[] = [];
    if (offset === 0) {
      let cq = admin
        .from("creators_index")
        .select(CREATOR_LIST_COLUMNS)
        .eq("is_curated", true)
        .order("followers", { ascending: false, nullsFirst: false })
        .limit(20);
      if (language) cq = cq.eq("language", language);
      if (niche) {
        const cor = nicheOrClause(niche);
        if (cor) cq = cq.or(cor);
      }
      const cr = await cq;
      curatedRows = (cr.data ?? []) as unknown as Record<string, unknown>[];
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({
        creators: [],
        hasMore: false,
        count: 0,
        error: error.message,
      });
    }

    let rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (curatedRows.length) {
      const seenU = new Set(curatedRows.map((r) => String(r.username || "").toLowerCase()));
      rows = [...curatedRows, ...rows.filter((r) => !seenU.has(String(r.username || "").toLowerCase()))];
    }
    // Exact-tag safety net: drop any row that leaked through SQL.
    if (niche) {
      rows = rows.filter((row) =>
        creatorMatchesNicheFilter(
          {
            primaryNiche: typeof row.primary_niche === "string" ? row.primary_niche : "",
            niche: typeof row.primary_niche === "string" ? row.primary_niche : "",
            niches: Array.isArray(row.niches) ? (row.niches as string[]) : [],
          },
          niche
        )
      );
    }
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const pageSeed = (Math.floor(offset / limit) + 1) * 7919;
    const shuffled = seededShuffle(page, pageSeed);
    const creators: FeedCreator[] = shuffled.map(catalogRowToFeedCreator);

    return NextResponse.json({
      creators,
      hasMore,
      count: creators.length,
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
