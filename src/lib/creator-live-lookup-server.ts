import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogRowToFeedCreator } from "@/lib/discovery-feed";
import { isBrandRow, readCatalogRowsByKey } from "@/lib/catalog-query";
import { CreatorNotFound, refreshCreator } from "@/lib/scraper/ingest";
import { creatorKey, knownKeys, normalizePlatform } from "@/lib/scraper/identity";
import { AllProvidersFailed } from "@/lib/scraper/sources";
import { ProviderError } from "@/lib/scraper/http";
import { CallMeter, type CreatorSource, type ScrapedProfile } from "@/lib/scraper/types";
import { LIVE_LOOKUP_MAX_PER_HOUR } from "@/lib/plan-limits";
import {
  isLookupFresh,
  lookupErrorMessage,
  lookupPlatformOrder,
  parseCreatorLookup,
  type LookupErrorCode,
  type LookupFailure,
  type LookupPlatform,
  type LookupResponse,
  type LookupSuccess,
} from "@/lib/creator-live-lookup";

// Server side of the creator lookup (/api/creators/lookup).
//
//   1. Read the handle or profile link; pick the platforms to try.
//   2. Stored and refreshed in the last 3 days → served from creators_index,
//      no API call.
//   3. Otherwise one live refresh through the scraper (lib/scraper/ingest
//      refreshCreator: profile + latest videos, covers, snapshots, rollup), on
//      the first platform where the account exists. A user's explicit lookup
//      skips the discovery gate (follower range, brands): brands are stored
//      and flagged (is_brand) like any refresh; private accounts are reported,
//      not stored (their posts can't be read).
//
// Cost guards: live lookups per workspace owner per hour (CREATOR_LOOKUP_MAX_PER_HOUR,
// default LIVE_LOOKUP_MAX_PER_HOUR = 60, lib/plan-limits), counted in scrape_runs (trigger "lookup:<user id>", with the
// calls per provider, so the Instagram call caps of the worker see them too)
// and in memory as a fallback; concurrent lookups of the same creator share
// one refresh (per server instance); the answer waits at most 25 s.

const HOUR = 3_600_000;

export type LookupDeps = {
  admin: SupabaseClient;
  sourceFor: (platform: LookupPlatform) => CreatorSource | null;
  nowMs?: () => number;
  timeoutMs?: number;
  maxPerHour?: number;
};

export type LookupInput = {
  userId: string;
  query: string;
  platform?: string | null;
  tab?: string | null;
  lang?: "en" | "fr";
  /** False: answer only from the catalog (free plan), never a live call. Default true. */
  allowLive?: boolean;
};

export type LookupOutcome = { status: number; body: LookupResponse };

const STATUS: Record<LookupErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  plan_required: 402,
  not_found: 404,
  conflict: 409,
  private: 422,
  rate_limited: 429,
  failed: 502,
  no_credits: 503,
  unavailable: 503,
  timeout: 504,
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const lookupMaxPerHour = () => envInt("CREATOR_LOOKUP_MAX_PER_HOUR", LIVE_LOOKUP_MAX_PER_HOUR);

// Per instance: live lookups running now (shared by concurrent callers) and recent ones per user.
const inflight = new Map<string, Promise<LookupOutcome>>();
const recentByUser = new Map<string, number[]>();

/** Tests only. */
export function resetLookupState(): void {
  inflight.clear();
  recentByUser.clear();
}

const lookupTrigger = (userId: string) => `lookup:${userId}`;

function failure(code: LookupErrorCode, lang: "en" | "fr", ctx: { handle?: string; platform?: LookupPlatform | null; retryAfterSec?: number } = {}): LookupOutcome {
  const body: LookupFailure = {
    ok: false,
    code,
    message: lookupErrorMessage(code, lang, { handle: ctx.handle, platform: ctx.platform, retryAfterMin: ctx.retryAfterSec ? Math.max(1, Math.ceil(ctx.retryAfterSec / 60)) : undefined }),
    ...(ctx.handle ? { handle: ctx.handle } : {}),
    ...(ctx.platform !== undefined ? { platform: ctx.platform } : {}),
    ...(ctx.retryAfterSec ? { retryAfterSec: ctx.retryAfterSec } : {}),
  };
  return { status: STATUS[code], body };
}

function success(row: Record<string, unknown>, platform: LookupPlatform, extra: { source: "db" | "live"; isNew: boolean; apiCalls: number }): LookupOutcome {
  const body: LookupSuccess = {
    ok: true,
    creator: catalogRowToFeedCreator(row),
    storageKey: String(row.username),
    platform,
    source: extra.source,
    isNew: extra.isNew,
    isBrand: isBrandRow(row),
    apiCalls: extra.apiCalls,
  };
  return { status: 200, body };
}

/** The stored row of this creator on a platform (current key, else a pre-prefix key). */
function storedRowFor(rows: Record<string, unknown>[], platform: LookupPlatform, handle: string): Record<string, unknown> | null {
  for (const key of knownKeys(platform, handle)) {
    const row = rows.find((r) => String(r.username).toLowerCase() === key && normalizePlatform(r.platform) === platform);
    if (row) return row;
  }
  return null;
}

/** Wraps a source to keep the profile it read (to tell a private account from a missing one). */
function capturing(source: CreatorSource): { source: CreatorSource; profile: () => ScrapedProfile | null } {
  let seen: ScrapedProfile | null = null;
  return {
    profile: () => seen,
    source: {
      name: source.name,
      platform: source.platform,
      get callsPerRefresh() {
        return source.callsPerRefresh;
      },
      available: () => source.available(),
      profile: async (handle, meter) => (seen = await source.profile(handle, meter)),
      videos: (handle, count, meter) => source.videos(handle, count, meter),
      search: (keyword, count, meter) => source.search(keyword, count, meter),
    },
  };
}

/** Live lookups this user started in the last hour, and when the oldest one leaves the window. */
async function recentLookups(admin: SupabaseClient, userId: string, now: number): Promise<{ count: number; oldestMs: number | null }> {
  const since = now - HOUR;
  const mem = (recentByUser.get(userId) ?? []).filter((t) => t > since);
  recentByUser.set(userId, mem);
  let db: number[] = [];
  try {
    const { data, error } = await admin
      .from("scrape_runs")
      .select("started_at")
      .eq("trigger", lookupTrigger(userId))
      .gte("started_at", new Date(since).toISOString())
      .order("started_at", { ascending: true })
      .limit(500);
    if (!error) db = (data ?? []).map((r: { started_at?: string }) => Date.parse(String(r.started_at))).filter(Number.isFinite);
  } catch {
    // The in-memory count still applies.
  }
  const times = db.length >= mem.length ? db : mem;
  return { count: times.length, oldestMs: times.length ? Math.min(...times) : null };
}

/** One lookup. Never throws: every outcome is a status and a body. */
export async function runCreatorLookup(deps: LookupDeps, input: LookupInput): Promise<LookupOutcome> {
  const lang = input.lang ?? "en";
  const now = deps.nowMs ?? (() => Date.now());
  const parsed = parseCreatorLookup(input.query);
  if (!parsed) return failure("invalid", lang);
  const handle = parsed.handle;
  let order = lookupPlatformOrder(parsed, input.platform, input.tab);
  if (!order.length) return failure("invalid", lang, { handle });

  // 1. What the catalog already holds (no API call).
  let rows: Record<string, unknown>[];
  try {
    rows = await readCatalogRowsByKey(deps.admin, order.flatMap((p) => knownKeys(p, handle)));
  } catch {
    return failure("failed", lang, { handle });
  }
  const stored = new Map(order.map((p) => [p, storedRowFor(rows, p, handle)] as const));
  const auto = order.length > 1;
  if (auto) {
    // "auto": a creator we already know under this handle is the one meant.
    const known = order.filter((p) => stored.get(p));
    if (known.length) order = [known[0]];
  }
  const first = order[0];
  const firstRow = stored.get(first) ?? null;
  if (firstRow && isLookupFresh(firstRow, now())) return success(firstRow, first, { source: "db", isNew: false, apiCalls: 0 });

  if (input.allowLive === false) return failure("plan_required", lang, { handle, platform: order.length === 1 ? first : null });

  // 2. A live refresh. Concurrent lookups of the same creator share it.
  const timeoutMs = deps.timeoutMs ?? 25_000;
  const onTimeout = () => failure("timeout", lang, { handle, platform: first });
  const flightKey = `${order.join(">")}:${handle}`;
  const running = inflight.get(flightKey);
  if (running) {
    const shared = await withTimeout(running, timeoutMs, onTimeout);
    // Another user's hourly limit is not this user's: only then try on our own.
    if (shared.body.ok || shared.body.code !== "rate_limited") return withLang(shared, lang, handle);
    return runCreatorLookup(deps, input);
  }
  // Registered before any await, so a concurrent caller joins this one.
  let settle!: (o: LookupOutcome) => void;
  const flight = new Promise<LookupOutcome>((resolve) => (settle = resolve));
  inflight.set(flightKey, flight);
  void flight.finally(() => inflight.delete(flightKey));

  const max = deps.maxPerHour ?? lookupMaxPerHour();
  const recent = await recentLookups(deps.admin, input.userId, now());
  if (recent.count >= max) {
    const retryAfterSec = recent.oldestMs ? Math.max(60, Math.ceil((recent.oldestMs + HOUR - now()) / 1000)) : 3600;
    const limited = failure("rate_limited", lang, { handle, retryAfterSec });
    settle(limited);
    return limited;
  }
  recentByUser.set(input.userId, [...(recentByUser.get(input.userId) ?? []), now()]);

  liveLookup(deps, { ...input, lang }, handle, order, stored).then(settle, () => settle(failure("failed", lang, { handle, platform: first })));
  return withTimeout(flight, timeoutMs, onTimeout);
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** A shared result in the caller's language (the first caller's lang wrote the message). */
function withLang(outcome: LookupOutcome, lang: "en" | "fr", handle: string): LookupOutcome {
  if (outcome.body.ok) return outcome;
  const b = outcome.body;
  return { status: outcome.status, body: { ...b, message: lookupErrorMessage(b.code, lang, { handle: b.handle ?? handle, platform: b.platform ?? null, retryAfterMin: b.retryAfterSec ? Math.ceil(b.retryAfterSec / 60) : undefined }) } };
}

async function liveLookup(
  deps: LookupDeps,
  input: LookupInput & { lang: "en" | "fr" },
  handle: string,
  order: LookupPlatform[],
  stored: Map<LookupPlatform, Record<string, unknown> | null>,
): Promise<LookupOutcome> {
  const { admin } = deps;
  const lang = input.lang;
  const meter = new CallMeter();
  const tried: { platform: LookupPlatform; result: string }[] = [];

  // Counted like a worker pass (api_calls, calls per provider, credits): the
  // Instagram call caps and the per-user hourly limit read these rows.
  let runId: number | null = null;
  try {
    const { data } = await admin
      .from("scrape_runs")
      .insert({ trigger: lookupTrigger(input.userId), notes: { lookup: { handle, platforms: order } } })
      .select("id")
      .single();
    runId = data?.id ?? null;
  } catch {
    runId = null;
  }

  let outcome: LookupOutcome | null = null;
  let worst: { code: LookupErrorCode; platform: LookupPlatform } | null = null;
  const rank: Partial<Record<LookupErrorCode, number>> = { not_found: 1, failed: 2, conflict: 3, unavailable: 4, no_credits: 5 };
  const note = (code: LookupErrorCode, platform: LookupPlatform) => {
    if (!worst || (rank[code] ?? 0) > (rank[worst.code] ?? 0)) worst = { code, platform };
  };
  let isNew = false;
  let videos = 0;

  for (const platform of order) {
    const base = deps.sourceFor(platform);
    if (!base) {
      tried.push({ platform, result: "no provider" });
      note("unavailable", platform);
      continue;
    }
    const watched = capturing(base);
    const key = String(stored.get(platform)?.username ?? creatorKey(platform, handle));
    try {
      const r = await refreshCreator(admin, watched.source, key, { meter, nowMs: deps.nowMs?.() });
      isNew = r.isNew;
      videos = r.videos;
      const [row] = await readCatalogRowsByKey(admin, [r.username]);
      tried.push({ platform, result: "ok" });
      outcome = row ? success(row, platform, { source: "live", isNew: r.isNew, apiCalls: meter.calls }) : failure("failed", lang, { handle, platform });
      break;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      tried.push({ platform, result: message.slice(0, 200) });
      if (e instanceof CreatorNotFound) {
        if (watched.profile()?.isPrivate) {
          // Found, but its posts can't be read: that is the answer, no other platform.
          outcome = failure("private", lang, { handle, platform });
          break;
        }
        note("not_found", platform);
        continue;
      }
      if (e instanceof AllProvidersFailed) {
        note(e.allDown ? "no_credits" : "failed", platform);
        continue;
      }
      if (e instanceof ProviderError) {
        note(e.providerDown ? "no_credits" : "failed", platform);
        continue;
      }
      note(/is stored as a/.test(message) ? "conflict" : "failed", platform);
    }
  }
  if (!outcome) {
    const w = worst as { code: LookupErrorCode; platform: LookupPlatform } | null;
    // Not found anywhere: name the platform only when one was tried.
    outcome = failure(w?.code ?? "not_found", lang, { handle, platform: w?.code === "not_found" && order.length > 1 ? null : (w?.platform ?? null) });
  }

  if (runId != null) {
    try {
      await admin
        .from("scrape_runs")
        .update({
          finished_at: new Date().toISOString(),
          jobs_claimed: 1,
          jobs_done: outcome.body.ok ? 1 : 0,
          jobs_failed: outcome.body.ok ? 0 : 1,
          api_calls: meter.calls,
          creators_new: outcome.body.ok && isNew ? 1 : 0,
          videos_upserted: videos,
          notes: {
            lookup: { handle, platforms: order, tried, result: outcome.body.ok ? "ok" : outcome.body.code },
            credits: meter.credits,
            callsByProvider: meter.byProvider,
          },
        })
        .eq("id", runId);
    } catch {
      // Accounting only.
    }
  }
  return outcome;
}
