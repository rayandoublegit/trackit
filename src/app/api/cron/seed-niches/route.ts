import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildSeedTargets, getDailySlice, dayIndexUTC } from "@/lib/niche-tree";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SC_API_KEY = process.env.SCRAPECREATORS_API_KEY;
const MIN_FOLLOWERS = 1_000; // Fill 1–10k discovery bucket across niches
const MAX_FOLLOWERS = 1_000_000; // 1M ceiling per ICP
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


const AVATAR_BUCKET = "avatars";

// Downloads a (possibly-expiring) remote avatar and stores it permanently in
// Supabase Storage. Returns the permanent public URL, or null on any failure.
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
    if (error) {
      console.error(`avatar upload failed for ${username}:`, error.message);
      return null;
    }
    const { data } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
    return data?.publicUrl || null;
  } catch (e) {
    console.error(`storeAvatar error for ${username}:`, e);
    return null;
  }
}

type SCUser = {
  unique_id?: string;
  nickname?: string;
  follower_count?: number;
  signature?: string;
  avatar_168x168?: { url_list?: string[] };
  avatar_medium?: { url_list?: string[] };
};

// Fetch one page of users for a query; returns { users, nextCursor }
async function fetchPage(query: string, cursor?: number) {
  const url = new URL("https://api.scrapecreators.com/v1/tiktok/search/users");
  url.searchParams.set("query", query);
  if (cursor) url.searchParams.set("cursor", String(cursor));
  const res = await fetch(url.toString(), { headers: { "x-api-key": SC_API_KEY! } });
  if (!res.ok) return { users: [] as SCUser[], nextCursor: undefined };
  const data = await res.json();
  const userList = (data?.user_list ?? []) as { user_info?: SCUser }[];
  const users = userList.map(u => u.user_info).filter((u): u is SCUser => !!u && !!u.unique_id);
  return { users, nextCursor: data?.cursor as number | undefined };
}

async function seedTarget(query: string, tags: string[], pages: number) {
  if (!SC_API_KEY) return 0;
  let seeded = 0;
  let cursor: number | undefined = undefined;
  try {
    for (let p = 0; p < pages; p++) {
      const { users, nextCursor } = await fetchPage(query, cursor);
      if (users.length === 0) break;

      const filtered = users.filter(u => {
        const f = Number(u.follower_count || 0);
        return f >= MIN_FOLLOWERS && f <= MAX_FOLLOWERS;
      });
      const upserts = await Promise.all(
        filtered.map(async u => {
          const followers = Number(u.follower_count || 0);
          const username = String(u.unique_id);
          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(String(u.nickname || u.unique_id))}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`;
          const remote = u.avatar_medium?.url_list?.[0] || u.avatar_168x168?.url_list?.[0] || "";
          // Store the avatar permanently; fall back to remote URL, then ui-avatars.
          const stored = await storeAvatar(remote, username);
          return {
            username,
            display_name: String(u.nickname || u.unique_id),
            avatar_url: stored || remote || fallback,
            platform: "TikTok",
            followers,
            bio: String(u.signature || ""),
            // GARDE-FOU: le seeder ne doit JAMAIS poser le tag "curated" (reserve a l'ajout manuel).
            // On retire "curated" defensivement au cas ou un tag de niche s'appellerait ainsi.
            niches: tags.map(t => t.toLowerCase()).filter(t => t !== "curated"),
            // On ne touche PAS video_thumbnails ici: c'est le marqueur indestructible de curation.
            // Les nouvelles lignes scrapees naissent sans thumbnails; on ne les met pas a [] explicitement
            // pour ne jamais risquer d'ecraser ceux d'un cure existant.
            last_scraped_at: new Date().toISOString(),
            enrichment_status: "pending",
          };
        })
      );

      if (upserts.length > 0) {
        await supabaseAdmin
          .from("creators_index")
          .upsert(upserts, { onConflict: "username", ignoreDuplicates: true });
        seeded += upserts.length;
      }

      if (!nextCursor) break;
      cursor = nextCursor;
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) {
    console.error(`Failed to seed ${query}:`, e);
  }
  return seeded;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?pages=N controls depth per niche (default 1). ?only=fitness limits to one parent.
  const { searchParams } = new URL(request.url);
  const pages = Math.min(Math.max(Number(searchParams.get("pages") || 1), 1), 5);
  const only = searchParams.get("only");

  let targets = buildSeedTargets();
  if (only) {
    targets = targets.filter((t) => t.tags.includes(only));
  } else {
    // Rotate a slice each day so we don't re-query all ~180 niches daily.
    const slice = Math.min(Math.max(Number(searchParams.get("slice") || 40), 1), targets.length);
    targets = getDailySlice(targets, dayIndexUTC(), slice);
  }

  let total = 0;
  for (const t of targets) {
    total += await seedTarget(t.query, t.tags, pages);
    await new Promise(r => setTimeout(r, 300));
  }

  return NextResponse.json({ ok: true, targets: targets.length, pages, creators: total });
}
