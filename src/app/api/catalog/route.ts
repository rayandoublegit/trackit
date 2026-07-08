import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  catalogRowToFeedCreator,
  CREATOR_LIST_COLUMNS,
  creatorMatchesGeoFilter,
  creatorMatchesNicheFilter,
  nicheOrClause,
  type FeedCreator,
} from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * /api/catalog — Find It feed.
 * Paginated at the DB. Optional `search` queries the full creators_index (global).
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const searchRaw = (p.get("search") || p.get("q") || "").trim().replace(/^@/, "");
  const search = searchRaw.length >= 2 ? searchRaw.replace(/[%_,]/g, "") : "";
  const niche = search ? undefined : p.get("niche") || undefined;
  const language = search ? undefined : p.get("language") || undefined;
  const country = search ? undefined : (p.get("country") || "").trim().toUpperCase() || undefined;
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const maxLimit = search ? 50 : niche ? 50 : 100;
  const defaultLimit = search ? 30 : niche ? 25 : 48;
  const limit = Math.min(maxLimit, Math.max(1, Number(p.get("limit")) || defaultLimit));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ creators: [], hasMore: false, count: 0, error: "no db" });
  }
  const admin = createClient(url, key);

  try {
    const from = offset;
    const to = offset + limit;

    if (search) {
      const pattern = `%${search}%`;
      const { data, error } = await admin
        .from("creators_index")
        .select(CREATOR_LIST_COLUMNS)
        .or(`username.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern}`)
        .order("followers", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (error) {
        return NextResponse.json({
          creators: [],
          hasMore: false,
          count: 0,
          error: error.message,
        });
      }

      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const creators: FeedCreator[] = page.map(catalogRowToFeedCreator);

      return NextResponse.json({
        creators,
        hasMore,
        count: creators.length,
        search,
      });
    }

    // Fetch limit+1 to know hasMore without counting the whole table.

    let q = admin
      .from("creators_index")
      .select(CREATOR_LIST_COLUMNS)
      .order("followers", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (language) q = q.eq("language", language);
    if (country) q = q.or(`country_code.eq.${country},country_code.is.null`);

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
      if (niche) {
        const cor = nicheOrClause(niche);
        if (cor) cq = cq.or(cor);
      }
      if (language) cq = cq.eq("language", language);
      if (country) cq = cq.or(`country_code.eq.${country},country_code.is.null`);
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
    if (country || language) {
      rows = rows.filter((row) =>
        creatorMatchesGeoFilter(
          {
            countryCode: typeof row.country_code === "string" ? row.country_code : null,
            language: typeof row.language === "string" ? row.language : "",
          },
          { country, language }
        )
      );
    }
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    // Stable order: curated picks first (already prepended), then followers desc from SQL.
    const creators: FeedCreator[] = page.map(catalogRowToFeedCreator);

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
