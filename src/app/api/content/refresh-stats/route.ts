import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { fetchTikTokVideoRaw, parseVideoStats } from "@/lib/scrapecreators";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { contentId } = await req.json().catch(() => ({}));
  if (!contentId) return NextResponse.json({ error: "contentId required" }, { status: 400 });
  const { data: row } = await supa
    .from("creator_content")
    .select("id, post_url, brand_id")
    .eq("id", contentId)
    .maybeSingle();
  if (!row?.post_url) return NextResponse.json({ error: "no post_url on this content" }, { status: 404 });

  const access = await requireWorkspaceAccess(req, row.brand_id ? String(row.brand_id) : null);
  if ("error" in access) return access.error;

  try {
    const stats = parseVideoStats(await fetchTikTokVideoRaw(row.post_url));
    await supa.from("creator_content").update({
      views: stats.views, likes: stats.likes, comments: stats.comments,
      shares: stats.shares, posted_at: stats.postedAt,
      stats_updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return NextResponse.json({ ok: false, pending: true, reason: (e as Error).message }, { status: 200 });
  }
}
