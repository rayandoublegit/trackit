import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRemoteImage } from "@/lib/fetch-remote-image";
import { avatarFromDiscoverySavedRow, normalizeCreatorHandle, pickBestCreatorAvatar } from "@/lib/creator-avatar";
import { resolveCreatorAvatarRemoteUrl, storeTikTokAvatar, fetchFreshAvatarUrl, isUiAvatarsUrl } from "@/lib/tiktok-avatar";
import { getCachedImage, setCachedImage } from "@/lib/image-proxy-cache";

export const dynamic = "force-dynamic";

function isStablePublicUrl(url: string): boolean {
  if (!url || isUiAvatarsUrl(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("supabase.co") || url.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

function getAdmin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function lookupStoredAvatar(admin: NonNullable<ReturnType<typeof getAdmin>>, username: string): Promise<string | null> {
  const { data: indexRow } = await admin.from("creators_index").select("avatar_url").eq("username", username).maybeSingle();
  const indexUrl = pickBestCreatorAvatar(indexRow?.avatar_url);

  const { data: savedRows } = await admin
    .from("discovery_saved")
    .select("avatar_url, snapshot")
    .eq("creator_username", username)
    .limit(8);
  for (const row of savedRows ?? []) {
    const url = avatarFromDiscoverySavedRow(row);
    if (url) return url;
  }

  const { data: creatorRows } = await admin
    .from("creators")
    .select("avatar_url")
    .ilike("handle", username)
    .limit(8);
  for (const row of creatorRows ?? []) {
    const url = pickBestCreatorAvatar(row.avatar_url);
    if (url) return url;
  }

  return pickBestCreatorAvatar(indexUrl) || null;
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.replace(/^@/, "").trim().toLowerCase();
  if (!username) return new NextResponse("missing username", { status: 400 });

  let storedUrl: string | null = null;
  const admin = getAdmin();
  if (admin) {
    storedUrl = await lookupStoredAvatar(admin, username);
  }

  if (storedUrl && isStablePublicUrl(storedUrl)) {
    return NextResponse.redirect(storedUrl, {
      status: 302,
      headers: { "cache-control": "public, max-age=86400" },
    });
  }

  const cacheKey = `${username}::${storedUrl || "none"}`;
  const hit = getCachedImage(cacheKey);
  if (hit) {
    return new NextResponse(hit.body, {
      status: 200,
      headers: {
        "content-type": hit.contentType,
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  }

  const remoteUrl = await resolveCreatorAvatarRemoteUrl(username, storedUrl);
  let img = remoteUrl ? await fetchRemoteImage(remoteUrl) : null;
  let usedUrl = remoteUrl;

  if (!img) {
    const fresh = await fetchFreshAvatarUrl(username);
    if (fresh && fresh !== remoteUrl) {
      img = await fetchRemoteImage(fresh);
      usedUrl = fresh;
    }
  }

  if (!img || !usedUrl) return new NextResponse("no avatar", { status: 404 });

  const buf = await new Response(img.body).arrayBuffer();
  setCachedImage(cacheKey, buf, img.contentType);

  // Persist a permanent copy when we had to refresh (fire-and-forget).
  if (admin && usedUrl !== storedUrl && !isStablePublicUrl(storedUrl ?? "")) {
    void storeTikTokAvatar(admin, usedUrl, username).then((permanent) => {
      if (permanent) {
        void admin.from("creators_index").update({ avatar_url: permanent }).eq("username", username);
      }
    });
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": img.contentType,
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
