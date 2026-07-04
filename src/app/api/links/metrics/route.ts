import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/links/metrics?brand_id=...&campaign_id=...(optional)&days=30
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brandId = sp.get("brand_id");
  const campaignId = sp.get("campaign_id");
  const days = Math.min(Number(sp.get("days") ?? 30), 365);
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  let lq = supa
    .from("affiliate_links")
    .select("id, slug, creator_username, campaign_id, content_id, destination_url, active, created_at")
    .eq("brand_id", brandId);
  if (campaignId) lq = lq.eq("campaign_id", campaignId);
  const { data: links, error: lerr } = await lq;
  if (lerr) return NextResponse.json({ error: lerr.message }, { status: 500 });
  if (!links?.length) return NextResponse.json({ links: [], totals: { clicks: 0, uniques: 0 } });

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const ids = links.map((l) => l.id);
  const { data: clicks, error: cerr } = await supa
    .from("link_clicks")
    .select("link_id, ip_hash, device, country, referrer_domain, created_at")
    .in("link_id", ids)
    .gte("created_at", since)
    .limit(50000);
  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 500 });

  const byLink = new Map<string, { clicks: number; uniq: Set<string>; byDay: Record<string, number>; devices: Record<string, number>; countries: Record<string, number>; sources: Record<string, number> }>();
  for (const l of links) byLink.set(l.id, { clicks: 0, uniq: new Set(), byDay: {}, devices: {}, countries: {}, sources: {} });
  for (const c of clicks ?? []) {
    const b = byLink.get(c.link_id as string);
    if (!b) continue;
    b.clicks++;
    if (c.ip_hash) b.uniq.add(c.ip_hash as string);
    const day = String(c.created_at).slice(0, 10);
    b.byDay[day] = (b.byDay[day] ?? 0) + 1;
    if (c.device) b.devices[c.device as string] = (b.devices[c.device as string] ?? 0) + 1;
    if (c.country) b.countries[c.country as string] = (b.countries[c.country as string] ?? 0) + 1;
    const src = (c.referrer_domain as string) || "direct";
    b.sources[src] = (b.sources[src] ?? 0) + 1;
  }

  // Sales attributed to these links (Lot B)
  const slugs = links.map((l) => l.slug);
  const { data: sales } = await supa
    .from("sales")
    .select("attributed_ref, order_amount, commission_amount, created_at")
    .in("attributed_ref", slugs)
    .gte("created_at", since)
    .limit(20000);
  const salesByRef = new Map<string, { count: number; revenue: number; commission: number }>();
  for (const sl of sales ?? []) {
    const k = sl.attributed_ref as string;
    const b = salesByRef.get(k) ?? { count: 0, revenue: 0, commission: 0 };
    b.count++;
    b.revenue += Number(sl.order_amount) || 0;
    b.commission += Number(sl.commission_amount) || 0;
    salesByRef.set(k, b);
  }

  const out = links.map((l) => {
    const b = byLink.get(l.id)!;
    const salesCount = salesByRef.get(l.slug)?.count ?? 0;
    const revenue = Number((salesByRef.get(l.slug)?.revenue ?? 0).toFixed(2));
    const commission = Number((salesByRef.get(l.slug)?.commission ?? 0).toFixed(2));
    return {
      ...l,
      metrics: {
        clicks: b.clicks,
        uniques: b.uniq.size,
        sales: salesCount,
        revenue,
        commission,
        conversionRate: b.clicks > 0 ? Number(((salesCount / b.clicks) * 100).toFixed(2)) : 0,
        aov: salesCount > 0 ? Number((revenue / salesCount).toFixed(2)) : 0,
        epc: b.clicks > 0 ? Number((revenue / b.clicks).toFixed(2)) : 0,
        byDay: b.byDay,
        devices: b.devices,
        countries: b.countries,
        sources: b.sources,
      },
    };
  });
  const totals = {
    clicks: out.reduce((s, l) => s + l.metrics.clicks, 0),
    uniques: out.reduce((s, l) => s + l.metrics.uniques, 0),
    sales: out.reduce((s, l) => s + l.metrics.sales, 0),
    revenue: Number(out.reduce((s, l) => s + l.metrics.revenue, 0).toFixed(2)),
    commission: Number(out.reduce((s, l) => s + l.metrics.commission, 0).toFixed(2)),
  };
  return NextResponse.json({ links: out, totals, days });
}
