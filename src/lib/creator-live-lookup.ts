// Live lookup of one creator by handle or profile link ("@luna", "luna",
// "tiktok.com/@luna", "instagram.com/luna/", "youtube.com/@luna"), shared by
// the catalog search bar, the top search bar and /api/creators/lookup.
//
// Pure helpers only (parsing, platform order, freshness, copy) plus the
// client call: safe to import from client components. The server side lives
// in creator-live-lookup-server.ts.

import type { FeedCreator } from "@/lib/discovery-feed";

export type LookupPlatform = "tiktok" | "instagram" | "youtube";
export const LOOKUP_PLATFORMS: readonly LookupPlatform[] = ["tiktok", "instagram", "youtube"];

export type ParsedLookup = {
  /** Public handle, lowercase, no "@". */
  handle: string;
  /** Platform the input itself names (a profile link), else null. */
  platform: LookupPlatform | null;
  /** How the input was written: a link, "@handle" or a bare word. */
  kind: "url" | "at" | "plain";
};

const HANDLE_RE: Record<LookupPlatform | "any", RegExp> = {
  tiktok: /^[a-z0-9._]{2,24}$/,
  instagram: /^[a-z0-9._]{1,30}$/,
  youtube: /^[a-z0-9._-]{3,30}$/,
  any: /^[a-z0-9._-]{2,30}$/,
};

/** Instagram paths that are not profiles. */
const IG_RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "accounts", "direct", "stories", "about", "developer", "legal", "web", "challenge"]);

/** True when `handle` is a valid handle on `platform` (any platform when null). */
export function isValidHandle(handle: string, platform: LookupPlatform | null = null): boolean {
  if (!handle || handle.startsWith(".") || handle.endsWith(".") || handle.includes("..")) return false;
  return HANDLE_RE[platform ?? "any"].test(handle);
}

function hostPlatform(host: string): LookupPlatform | null {
  const h = host.toLowerCase().replace(/^www\.|^m\.|^mobile\./, "");
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "instagram.com" || h === "instagr.am") return "instagram";
  if (h === "youtube.com" || h === "music.youtube.com") return "youtube";
  return null;
}

function handleFromPath(platform: LookupPlatform, path: string): string | null {
  const parts = path.split("/").filter(Boolean).map((p) => decodeURIComponent(p).toLowerCase());
  if (!parts.length) return null;
  if (platform === "tiktok") {
    // tiktok.com/@name, tiktok.com/@name/video/123. Short links (vm.tiktok.com/xyz) can't be read.
    return parts[0].startsWith("@") ? parts[0].slice(1) : null;
  }
  if (platform === "instagram") {
    // instagram.com/name/, instagram.com/stories/name/123/
    if (parts[0] === "stories" && parts[1]) return parts[1];
    return IG_RESERVED.has(parts[0]) ? null : parts[0];
  }
  // youtube.com/@name, /c/name, /user/name (a /channel/UC… id is not a handle)
  if (parts[0].startsWith("@")) return parts[0].slice(1);
  if ((parts[0] === "c" || parts[0] === "user") && parts[1]) return parts[1];
  return null;
}

/**
 * Reads a handle or a profile link. Null when the input can't be a single
 * creator (several words, a video or post link, a short link, a keyword with
 * characters no handle has).
 */
export function parseCreatorLookup(raw: string): ParsedLookup | null {
  const input = String(raw ?? "").trim();
  if (!input || input.length > 300) return null;

  const looksUrl = /^(https?:\/\/)?([a-z0-9-]+\.)*(tiktok\.com|instagram\.com|instagr\.am|youtube\.com)(\/|$|\?)/i.test(input);
  if (looksUrl) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
      return null;
    }
    const platform = hostPlatform(url.hostname);
    if (!platform) return null;
    const handle = handleFromPath(platform, url.pathname);
    return handle && isValidHandle(handle, platform) ? { handle, platform, kind: "url" } : null;
  }

  if (/\s/.test(input)) return null;
  const at = input.startsWith("@");
  const handle = input.replace(/^@+/, "").toLowerCase();
  if (!isValidHandle(handle)) return null;
  return { handle, platform: null, kind: at ? "at" : "plain" };
}

/** True for "@name" and profile links: the user clearly means one creator. */
export const isExplicitLookup = (p: ParsedLookup | null): boolean => Boolean(p && p.kind !== "plain");

export function normalizeLookupPlatform(raw: unknown): LookupPlatform | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "tiktok" || v === "instagram" || v === "youtube" ? v : null;
}

/**
 * Platforms to try, in order. A link names its platform; an explicit
 * platform is the only one tried; "auto" tries the catalog tab first, then
 * TikTok, then Instagram (YouTube only through a link, the tab or explicitly).
 */
export function lookupPlatformOrder(parsed: ParsedLookup, requested: string | null | undefined, tab?: string | null): LookupPlatform[] {
  if (parsed.platform) return [parsed.platform];
  const explicit = normalizeLookupPlatform(requested);
  if (explicit) return [explicit];
  const order: LookupPlatform[] = [];
  const preferred = normalizeLookupPlatform(tab);
  if (preferred) order.push(preferred);
  for (const p of ["tiktok", "instagram"] as const) if (!order.includes(p)) order.push(p);
  // A handle that is invalid on one platform is not tried there.
  return order.filter((p) => isValidHandle(parsed.handle, p));
}

export const LOOKUP_FRESH_DAYS = 3;

/** A stored creator refreshed less than LOOKUP_FRESH_DAYS ago is served from the database (no API call). */
export function isLookupFresh(row: { last_scraped_at?: unknown; scrape_status?: unknown } | null | undefined, nowMs = Date.now(), freshDays = LOOKUP_FRESH_DAYS): boolean {
  if (!row) return false;
  if (row.scrape_status === "not_found") return false;
  const at = typeof row.last_scraped_at === "string" ? Date.parse(row.last_scraped_at) : NaN;
  if (!Number.isFinite(at)) return false;
  return nowMs - at < freshDays * 86_400_000;
}

export const lookupPlatformLabel = (p: LookupPlatform) => (p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube");

export type LookupErrorCode =
  | "invalid"
  | "unauthorized"
  | "plan_required"
  | "not_found"
  | "private"
  | "rate_limited"
  | "no_credits"
  | "unavailable"
  | "timeout"
  | "conflict"
  | "failed";

/** Message shown to the user for a failed lookup. */
export function lookupErrorMessage(code: LookupErrorCode, lang: "en" | "fr", ctx: { handle?: string; platform?: LookupPlatform | null; retryAfterMin?: number } = {}): string {
  const fr = lang === "fr";
  const who = ctx.handle ? `@${ctx.handle}` : fr ? "ce créateur" : "this creator";
  const on = ctx.platform ? (fr ? ` sur ${lookupPlatformLabel(ctx.platform)}` : ` on ${lookupPlatformLabel(ctx.platform)}`) : "";
  switch (code) {
    case "invalid":
      return fr ? "Tapez un @pseudo ou collez le lien d'un profil TikTok, Instagram ou YouTube." : "Type an @handle or paste a TikTok, Instagram or YouTube profile link.";
    case "unauthorized":
      return fr ? "Connectez-vous pour chercher un créateur." : "Sign in to look up a creator.";
    case "plan_required":
      return fr ? `${who} n'est pas encore dans la base. La recherche en direct est incluse dans les offres payantes.` : `${who} is not in the database yet. Live lookup comes with the paid plans.`;
    case "not_found":
      return fr ? `Aucun compte ${who}${on}. Vérifiez l'orthographe du pseudo.` : `No account ${who}${on}. Check the spelling of the handle.`;
    case "private":
      return fr ? `Le compte ${who}${on} est privé : ses publications ne peuvent pas être analysées.` : `${who}${on} is a private account: its posts can't be analysed.`;
    case "rate_limited":
      return fr
        ? `Limite de recherches en direct atteinte. Réessayez dans ${ctx.retryAfterMin ?? 60} min.`
        : `Live lookup limit reached. Try again in ${ctx.retryAfterMin ?? 60} min.`;
    case "no_credits":
      return fr ? "La recherche en direct est momentanément indisponible (quota du fournisseur atteint)." : "Live lookup is unavailable for now (provider quota reached).";
    case "unavailable":
      return fr ? `La recherche en direct${on} n'est pas disponible pour le moment.` : `Live lookup${on} is not available right now.`;
    case "timeout":
      return fr ? `La recherche de ${who} prend plus de temps que prévu. Réessayez dans un instant.` : `Looking up ${who} is taking longer than expected. Try again in a moment.`;
    case "conflict":
      return fr ? `${who} est déjà enregistré sur une autre plateforme.` : `${who} is already stored on another platform.`;
    default:
      return fr ? `La recherche de ${who} a échoué. Réessayez.` : `Looking up ${who} failed. Try again.`;
  }
}

export type LookupSuccess = {
  ok: true;
  creator: FeedCreator;
  /** creators_index.username: opens the creator page. */
  storageKey: string;
  platform: LookupPlatform;
  /** "db": served from the catalog; "live": fetched from the platform now. */
  source: "db" | "live";
  /** Not in the catalog before this lookup. */
  isNew: boolean;
  isBrand: boolean;
  apiCalls: number;
};
export type LookupFailure = {
  ok: false;
  code: LookupErrorCode;
  message: string;
  handle?: string;
  platform?: LookupPlatform | null;
  retryAfterSec?: number;
};
export type LookupResponse = LookupSuccess | LookupFailure;

/** Client call to /api/creators/lookup. Never throws, except an AbortError when `signal` aborts. */
export async function lookupCreatorLive(
  query: string,
  opts: { platform?: LookupPlatform | "auto"; tab?: string; lang?: "en" | "fr"; signal?: AbortSignal } = {},
): Promise<LookupResponse> {
  const lang = opts.lang ?? "en";
  const qs = new URLSearchParams({ q: query, platform: opts.platform ?? "auto", lang });
  if (opts.tab) qs.set("tab", opts.tab);
  try {
    const r = await fetch(`/api/creators/lookup?${qs.toString()}`, { method: "POST", signal: opts.signal });
    const body = (await r.json().catch(() => null)) as LookupResponse | null;
    if (body && typeof body === "object" && "ok" in body) return body;
    return { ok: false, code: r.status === 401 ? "unauthorized" : "failed", message: lookupErrorMessage(r.status === 401 ? "unauthorized" : "failed", lang) };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, code: "failed", message: lookupErrorMessage("failed", lang) };
  }
}
