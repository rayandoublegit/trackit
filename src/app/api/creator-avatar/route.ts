import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchRemoteImage, isAllowedImageHost } from "@/lib/fetch-remote-image";
import { avatarFromDiscoverySavedRow, pickBestCreatorAvatar } from "@/lib/creator-avatar";
import {
  isUiAvatarsUrl,
  resolveCreatorAvatarRemoteUrl,
  storeTikTokAvatar,
} from "@/lib/tiktok-avatar";
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
    .ilike("creator_username", username)
    .limit(12);
  for (const row of savedRows ?? []) {
    const url = avatarFromDiscoverySavedRow(row);
    if (url) return url;
  }

  const { data: creatorRows } = await admin
    .from("creators")
    .select("avatar_url")
    .ilike("handle", username)
    .limit(12);
  for (const row of creatorRows ?? []) {
    const url = pickBestCreatorAvatar(row.avatar_url);
    if (url) return url;
  }

  return pickBestCreatorAvatar(indexUrl) || null;
}

function uniqueUrls(...candidates: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    const url = candidate?.trim() || "";
    if (!url || isUiAvatarsUrl(url) || !isAllowedImageHost(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function persistPermanentAvatar(
  admin: SupabaseClient,
  username: string,
  remoteUrl: string
): Promise<string | null> {
  const permanent = await storeTikTokAvatar(admin, remoteUrl, username);
  if (!permanent) return null;

  await Promise.all([
    admin.from("creators_index").update({ avatar_url: permanent }).eq("username", username),
    admin.from("creators").update({ avatar_url: permanent }).ilike("handle", username),
  ]);

  return permanent;
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.replace(/^@/, "").trim().toLowerCase();
  if (!username) return new NextResponse("missing username", { status: 400 });

  const srcParam = req.nextUrl.searchParams.get("src");

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

  const cacheKey = `${username}::${srcParam || storedUrl || "none"}`;
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

  const resolved = await resolveCreatorAvatarRemoteUrl(username, storedUrl);
  const candidates = uniqueUrls(srcParam, storedUrl, resolved);

  for (const remoteUrl of candidates) {
    const img = await fetchRemoteImage(remoteUrl);
    if (!img) continue;

    const buf = await new Response(img.body).arrayBuffer();
    setCachedImage(cacheKey, buf, img.contentType);

    if (admin && !isStablePublicUrl(storedUrl ?? "")) {
      void persistPermanentAvatar(admin, username, remoteUrl);
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": img.contentType,
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  }

  return new NextResponse("no avatar", { status: 404 });
}
