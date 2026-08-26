/**
 * In-memory stale-while-revalidate cache for dashboard GET JSON.
 * Makes revisiting pages feel instant while refreshing in the background.
 */

type CacheEntry = {
  expiresAt: number;
  staleAt: number;
  value: unknown;
  inflight?: Promise<unknown>;
};

const store = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 45_000;
const DEFAULT_STALE_MS = 5 * 60_000;

export function dashboardCacheKey(path: string, init?: RequestInit): string {
  const method = (init?.method || "GET").toUpperCase();
  return `${method}:${path}`;
}

export function invalidateDashboardCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.includes(prefix)) store.delete(key);
  }
}

export function peekDashboardCache<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  return hit.value as T;
}

export function seedDashboardCache<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  const now = Date.now();
  store.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleAt: now + DEFAULT_STALE_MS,
  });
}

type CachedFetchOptions<T> = {
  ttlMs?: number;
  staleMs?: number;
  parse?: (res: Response) => Promise<T>;
  /** When true, always return cached value immediately if present (even expired), and refresh in bg. */
  preferCache?: boolean;
};

export async function cachedJsonFetch<T>(
  path: string,
  init?: RequestInit,
  options?: CachedFetchOptions<T>,
): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const canCache = method === "GET" && !init?.body;
  const key = dashboardCacheKey(path, init);
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
  const parse = options?.parse ?? (async (res: Response) => (await res.json()) as T);
  const now = Date.now();

  if (canCache) {
    const hit = store.get(key);
    if (hit) {
      const fresh = now < hit.expiresAt;
      const usable = now < hit.staleAt || options?.preferCache;
      if (fresh) return hit.value as T;
      if (usable) {
        if (!hit.inflight) {
          hit.inflight = (async () => {
            try {
              const res = await fetch(path, { ...init, cache: "no-store" });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const value = await parse(res);
              const t = Date.now();
              store.set(key, { value, expiresAt: t + ttlMs, staleAt: t + staleMs });
              return value;
            } finally {
              const cur = store.get(key);
              if (cur) delete cur.inflight;
            }
          })();
        }
        return hit.value as T;
      }
      if (hit.inflight) return hit.inflight as Promise<T>;
    }
  }

  const inflight = (async () => {
    const res = await fetch(path, { ...init, cache: "no-store" });
    if (!res.ok) {
      // Serve stale on hard failure if we have anything.
      const stale = store.get(key);
      if (stale) return stale.value as T;
      throw new Error(`HTTP ${res.status}`);
    }
    const value = await parse(res);
    if (canCache) {
      const t = Date.now();
      store.set(key, { value, expiresAt: t + ttlMs, staleAt: t + staleMs });
    }
    return value;
  })();

  if (canCache) {
    const prev = store.get(key);
    if (prev) prev.inflight = inflight;
    else store.set(key, { value: undefined, expiresAt: 0, staleAt: 0, inflight });
  }

  return inflight;
}

/** Warm common dashboard endpoints before the user clicks. */
export function prefetchDashboardData(view: string): void {
  if (typeof window === "undefined") return;
  const warm = (path: string) => {
    void cachedJsonFetch(path, { credentials: "include" }, { preferCache: true }).catch(() => {});
  };
  switch (view) {
    case "creators":
    case "my-creators":
      warm("/api/saved");
      warm("/api/folders");
      break;
    case "campaigns":
    case "links":
      warm("/api/campaigns");
      break;
    case "analytics": {
      const tz = new Date().getTimezoneOffset();
      warm(`/api/analytics?range=30d&tzOffset=${tz}`);
      break;
    }
    case "brand-content":
      warm("/api/content");
      break;
    case "rpm":
      warm("/api/rpm");
      break;
    case "invitations":
      warm("/api/invitations");
      break;
    case "payouts":
    case "transactions":
    case "balance":
      warm("/api/payouts/history");
      break;
    default:
      break;
  }
}
