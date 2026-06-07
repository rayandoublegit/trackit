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

// The app's canonical niches (must match the discovery dropdown).
const CANONICAL = ["fitness", "fashion", "beauty", "tech", "food", "travel"];

// Map messy/variant/French sub-niche terms to a canonical parent niche.
const NICHE_MAP: Record<string, string> = {
  // fitness
  fitness: "fitness", muscu: "fitness", musculation: "fitness", gym: "fitness",
  sport: "fitness", fit: "fitness", bodybuilding: "fitness", crossfit: "fitness",
  yoga: "fitness", running: "fitness", workout: "fitness", calisthenics: "fitness",
  // fashion
  fashion: "fashion", mode: "fashion", outfit: "fashion", outfits: "fashion",
  ootd: "fashion", style: "fashion", streetwear: "fashion", luxe: "fashion",
  vetements: "fashion", sneakers: "fashion",
  // beauty
  beauty: "beauty", beaute: "beauty", "beauté": "beauty", beaut: "beauty", beat: "beauty",
  makeup: "beauty", maquillage: "beauty", skincare: "beauty", soin: "beauty",
  cheveux: "beauty", hair: "beauty", nails: "beauty", ongles: "beauty", parfum: "beauty",
  // tech
  tech: "tech", technologie: "tech", gadgets: "tech", ai: "tech", ia: "tech",
  coding: "tech", code: "tech", apps: "tech", gaming: "tech", jeux: "tech",
  // food
  food: "food", cuisine: "food", recette: "food", recettes: "food", cooking: "food",
  resto: "food", restaurant: "food", vegan: "food", patisserie: "food", boulangerie: "food",
  // travel
  travel: "travel", voyage: "travel", voyages: "travel", trip: "travel",
  vanlife: "travel", roadtrip: "travel", tourisme: "travel", aventure: "travel",
};

// Returns canonical parent niches + original sub-niches + "curated", deduped.
function normalizeNiches(raw: string): string[] {
  const subs = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const out = new Set<string>(["curated"]);
  for (const s of subs) {
    out.add(s); // keep the original sub-niche so it's searchable directly
    const parent = NICHE_MAP[s];
    if (parent) out.add(parent);
    else if (CANONICAL.includes(s)) out.add(s);
    // if unknown, the sub-niche is still kept above (just no parent mapping)
  }
  return Array.from(out);
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

// Fetch a TikTok video's real thumbnail via oEmbed (free, no key), store it permanently.
async function fetchTikTokVideo(videoUrl: string): Promise<{ url: string; thumbnail: string | null; views: number | null } | null> {
  const clean = videoUrl.trim();
  if (!clean) return null;
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(clean)}`);
    if (!res.ok) return { url: clean, thumbnail: null, views: null };
    const data = await res.json();
    const remoteThumb = data?.thumbnail_url || "";
    // Store the thumbnail permanently so it never expires (reuse storeAvatar's bucket).
    let stored: string | null = null;
    if (remoteThumb) {
      const key = "video_" + clean.replace(/[^a-zA-Z0-9]/g, "_").slice(-40);
      stored = await storeAvatar(remoteThumb, key);
    }
    return { url: clean, thumbnail: stored || remoteThumb || null, views: null };
  } catch {
    return { url: clean, thumbnail: null, views: null };
  }
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
  // niches: map typed sub-niches to canonical parent niches (+ keep originals + "curated")
  const nicheRaw = String(body.niches || "").trim();
  const niches = normalizeNiches(nicheRaw);

  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`;
  const stored = avatarInput ? await storeAvatar(avatarInput, username) : null;

  // Fetch + permanently store thumbnails for up to 3 TikTok video URLs.
  const videoUrls: string[] = Array.isArray(body.videoUrls)
    ? body.videoUrls.filter((u: unknown) => typeof u === "string" && u.trim()).slice(0, 3)
    : [];
  const videoThumbs = (await Promise.all(videoUrls.map(u => fetchTikTokVideo(u)))).filter(Boolean);

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
    video_thumbnails: videoThumbs,
    last_scraped_at: new Date().toISOString(),
  };

  // Reject duplicates — don't silently overwrite an existing creator.
  const { data: existing } = await supabaseAdmin
    .from("creators_index")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: false, error: "already added", duplicate: true }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from("creators_index")
    .insert(row);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, username, avatar_stored: !!stored });
}
