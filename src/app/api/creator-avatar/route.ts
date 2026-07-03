import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchRemoteImage, isAllowedImageHost } from "@/lib/fetch-remote-image";
import { avatarFromDiscoverySavedRow, pickBestCreatorAvatar } from "@/lib/creator-avatar";
import {
  isUiAvatarsUrl,
  refreshAndPersistCreatorAvatar,
  storeAvatarBuffer,
} from "@/lib/tiktok-avatar";
import { getCachedImage, setCachedImage } from "@/lib/image-proxy-cache";
import {
  releaseAvatarScrapeSlot,
  tryAcquireAvatarScrapeSlot,
} from "@/lib/avatar-scrape-limiter";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Skip live TikTok scrape for this long after a hard failure. */
const FAIL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Soft timeout for scrape + download + upload (no failed_at on timeout). */
const SCRAPE_TIMEOUT_MS = 8_000;

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

/** Front treats 404 as “show initials / profile icon” — never hang or 500. */
function fallbackNoAvatar(): NextResponse {
  return new NextResponse("no avatar", {
    status: 404,
    headers: { "cache-control": "public, max-age=60" },
  });
}

function isWithinFailCooldown(failedAt: string | null | undefined): boolean {
  if (!failedAt) return false;
  const ts = new Date(failedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < FAIL_COOLDOWN_MS;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type StoredAvatarLookup = {
  url: string | null;
  failedAt: string | null;
};

async function lookupStoredAvatar(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  username: string
): Promise<StoredAvatarLookup> {
  let indexRow: { avatar_url?: string | null; avatar_refresh_failed_at?: string | null } | null = null;
  const withFailCol = await admin
    .from("creators_index")
    .select("avatar_url, avatar_refresh_failed_at")
    .eq("username", username)
    .maybeSingle();
  if (withFailCol.error) {
    const fallback = await admin
      .from("creators_index")
      .select("avatar_url")
      .eq("username", username)
      .maybeSingle();
    indexRow = fallback.data;
  } else {
    indexRow = withFailCol.data;
  }

  const failedAt =
    typeof indexRow?.avatar_refresh_failed_at === "string"
      ? indexRow.avatar_refresh_failed_at
      : null;

  const indexUrl = pickBestCreatorAvatar(indexRow?.avatar_url);
  if (indexUrl && isStablePublicUrl(indexUrl)) {
    return { url: indexUrl, failedAt };
  }

  const { data: creatorRows } = await admin
    .from("creators")
    .select("avatar_url")
    .ilike("handle", username)
    .limit(6);
  for (const row of creatorRows ?? []) {
    const url = pickBestCreatorAvatar(row.avatar_url);
    if (url && isStablePublicUrl(url)) return { url, failedAt };
  }

  for (const row of creatorRows ?? []) {
    const url = pickBestCreatorAvatar(row.avatar_url);
    if (url) return { url, failedAt };
  }

  const { data: savedRows } = await admin
    .from("discovery_saved")
    .select("avatar_url, snapshot")
    .ilike("creator_username", username)
    .limit(6);
  for (const row of savedRows ?? []) {
    const url = avatarFromDiscoverySavedRow(row);
    if (url) return { url, failedAt };
  }

  return { url: pickBestCreatorAvatar(indexUrl) || null, failedAt };
}

async function markRefreshFailed(admin: SupabaseClient, username: string): Promise<void> {
  try {
    await admin
      .from("creators_index")
      .update({ avatar_refresh_failed_at: new Date().toISOString() })
      .eq("username", username);
  } catch {
    /* column may not exist yet — ignore */
  }
}

async function clearRefreshFailed(admin: SupabaseClient, username: string): Promise<void> {
  try {
    await admin
      .from("creators_index")
      .update({ avatar_refresh_failed_at: null })
      .eq("username", username);
  } catch {
    /* ignore */
  }
}

async function persistBuffer(
  admin: SupabaseClient,
  username: string,
  buf: Buffer,
  contentType: string
): Promise<string | null> {
  const permanent = await storeAvatarBuffer(admin, buf, contentType, username);
  if (!permanent) return null;

  const indexUpdate = await admin
    .from("creators_index")
    .update({ avatar_url: permanent, avatar_refresh_failed_at: null })
    .eq("username", username);
  if (indexUpdate.error) {
    await admin.from("creators_index").update({ avatar_url: permanent }).eq("username", username);
  }
  await admin.from("creators").update({ avatar_url: permanent }).ilike("handle", username);

  return permanent;
}

function redirectTo(url: string): NextResponse {
  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "cache-control": "public, max-age=86400",
      "x-permanent-avatar-url": url,
    },
  });
}

function serveBytes(
  buf: ArrayBuffer | Buffer,
  contentType: string,
  cacheKey: string,
  permanentUrl?: string | null
): NextResponse {
  const body = buf instanceof Buffer ? buf : Buffer.from(buf);
  setCachedImage(cacheKey, body, contentType);
  const headers: Record<string, string> = {
    "content-type": contentType,
    "cache-control": "public, max-age=86400, immutable",
  };
  if (permanentUrl && isStablePublicUrl(permanentUrl)) {
    headers["x-permanent-avatar-url"] = permanentUrl;
  }
  return new NextResponse(body, { status: 200, headers });
}

/**
 * Resolve a creator avatar:
 * 1. Permanent Supabase URL already in DB → redirect
 * 2. Try stored/src CDN URL → download, store permanently, update DB, redirect
 * 3. Scrape live TikTok profile (max 3 concurrent, 8s timeout, 7d fail cooldown)
 */
export async function GET(req: NextRequest) {
  try {
    const username = req.nextUrl.searchParams.get("username")?.replace(/^@/, "").trim().toLowerCase();
    if (!username) return new NextResponse("missing username", { status: 400 });

    const srcParam = req.nextUrl.searchParams.get("src");
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

    const admin = getAdmin();
    let storedUrl: string | null = null;
    let failedAt: string | null = null;
    if (admin) {
      const lookup = await lookupStoredAvatar(admin, username);
      storedUrl = lookup.url;
      failedAt = lookup.failedAt;
    }

    // Fast path: already permanently hosted.
    if (!forceRefresh && storedUrl && isStablePublicUrl(storedUrl)) {
      return redirectTo(storedUrl);
    }

    const cacheKey = `${username}::${forceRefresh ? "refresh" : srcParam || storedUrl || "none"}`;
    if (!forceRefresh) {
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
    }

    // 1) Try existing CDN URLs (src query + DB) unless force-refresh.
    //    No TikTok profile scrape here — no concurrency slot needed.
    if (!forceRefresh) {
      const candidates = [srcParam, storedUrl && !isStablePublicUrl(storedUrl) ? storedUrl : null]
        .map((u) => u?.trim() || "")
        .filter((u) => u && !isUiAvatarsUrl(u) && isAllowedImageHost(u));

      const seen = new Set<string>();
      for (const remoteUrl of candidates) {
        if (seen.has(remoteUrl)) continue;
        seen.add(remoteUrl);

        const img = await fetchRemoteImage(remoteUrl);
        if (!img) continue;

        const buf = Buffer.from(await new Response(img.body).arrayBuffer());
        if (!buf.length) continue;

        if (admin) {
          const permanent = await persistBuffer(admin, username, buf, img.contentType);
          if (permanent) return redirectTo(permanent);
        }

        return serveBytes(buf, img.contentType, cacheKey);
      }
    }

    // 2) Live TikTok scrape path — guarded by cooldown, concurrency, and timeout.
    if (isWithinFailCooldown(failedAt)) {
      return fallbackNoAvatar();
    }

    if (!tryAcquireAvatarScrapeSlot()) {
      // Saturated: do not queue — front shows initials; retry on a later view.
      return fallbackNoAvatar();
    }

    try {
      if (admin) {
        const refreshed = await withTimeout(
          refreshAndPersistCreatorAvatar(
            admin,
            username,
            forceRefresh ? null : srcParam || storedUrl
          ),
          SCRAPE_TIMEOUT_MS
        );

        if (refreshed === "timeout") {
          // Soft timeout: no failed_at — allow a later attempt.
          return fallbackNoAvatar();
        }

        if (refreshed) {
          await clearRefreshFailed(admin, username);
          if (isStablePublicUrl(refreshed.permanentUrl)) {
            setCachedImage(cacheKey, refreshed.bytes, refreshed.contentType);
            return redirectTo(refreshed.permanentUrl);
          }
          return serveBytes(refreshed.bytes, refreshed.contentType, cacheKey, refreshed.permanentUrl);
        }

        // Hard scrape failure (deleted account, empty profile, etc.).
        await markRefreshFailed(admin, username);
        return fallbackNoAvatar();
      }

      // No admin client — one-shot profile scrape for display only.
      const { fetchFreshAvatarUrl } = await import("@/lib/tiktok-avatar");
      const fresh = await withTimeout(fetchFreshAvatarUrl(username), SCRAPE_TIMEOUT_MS);
      if (fresh === "timeout" || !fresh) return fallbackNoAvatar();

      const img = await fetchRemoteImage(fresh);
      if (!img) return fallbackNoAvatar();
      const buf = Buffer.from(await new Response(img.body).arrayBuffer());
      return serveBytes(buf, img.contentType, cacheKey);
    } finally {
      releaseAvatarScrapeSlot();
    }
  } catch {
    return fallbackNoAvatar();
  }
}
