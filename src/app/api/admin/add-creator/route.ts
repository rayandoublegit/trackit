import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_SECRET = "trackit_admin_2026";
const AVATAR_BUCKET = "avatars";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function estimateEngagement(followers: number): number {
  if (followers < 10000) return 8.0;
  if (followers < 50000) return 6.5;
  if (followers < 200000) return 5.0;
  if (followers < 1000000) return 3.5;
  return 2.0;
}

// Download a remote avatar and store it permanently. Returns permanent URL or null.
async function storeAvatar(remoteUrl: string, username: string): Promise<string | null> {
  if (!remoteUrl || remoteUrl.includes("ui-avatars.com")) return null;
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    const objectPath = `tiktok_${username}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(objectPath, buf, { contentType, upsert: true });
    if (error) return null;
    const { data } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

function cleanHandle(raw: string): string {
  let h = raw.trim();
  // strip a full tiktok URL down to the handle
  const m = h.match(/tiktok\.com\/@?([A-Za-z0-9._]+)/i);
  if (m) h = m[1];
  h = h.replace(/^@/, "");
  return h.toLowerCase();
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const handleRaw = String(body.handle || "").trim();
  if (!handleRaw) {
    return NextResponse.json({ ok: false, error: "handle required" }, { status: 400 });
  }
  const username = cleanHandle(handleRaw);
  const displayName = String(body.displayName || username).trim();
  const followers = Number(body.followers || 0);
  const bio = String(body.bio || "").trim();
  const language = String(body.language || "").trim().toLowerCase();
  const location = String(body.location || "").trim();
  const avatarInput = String(body.avatarUrl || "").trim();
  // niches: comma-separated string -> array, always lowercased, always include "curated"
  const nicheRaw = String(body.niches || "").trim();
  const niches = Array.from(new Set(
    nicheRaw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean).concat("curated")
  ));

  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`;
  const stored = avatarInput ? await storeAvatar(avatarInput, username) : null;

  const row = {
    username,
    display_name: displayName,
    avatar_url: stored || avatarInput || fallback,
    platform: "TikTok",
    followers,
    engagement_rate: estimateEngagement(followers),
    avg_views: Math.floor(followers * 0.1),
    bio,
    niches,
    language: language || null,
    location: location || null,
    video_thumbnails: [],
    last_scraped_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("creators_index")
    .upsert(row, { onConflict: "username" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, username, avatar_stored: !!stored });
}
