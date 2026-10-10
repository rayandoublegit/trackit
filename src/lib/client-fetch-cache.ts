// Small in-memory cache for client fetches: entries live `ttlMs`, at most `max`
// are kept (oldest dropped first), and concurrent loads of one key share a
// single request. Used by the creator page and the video library so reopening
// a creator or a filter paints at once.

export type FetchCache<T> = {
  get(key: string): T | null;
  set(key: string, value: T): void;
  /** Cached value, else the pending load, else a new load. Failed loads are not cached. */
  load(key: string, loader: () => Promise<T>): Promise<T>;
  /** Start a load in the background unless the key is cached or loading. */
  prefetch(key: string, loader: () => Promise<T>): void;
  /** Forget one key (its next load fetches again). */
  delete(key: string): void;
  clear(): void;
};

export function createFetchCache<T>(opts: { ttlMs: number; max: number; now?: () => number }): FetchCache<T> {
  const now = opts.now ?? (() => Date.now());
  const entries = new Map<string, { at: number; value: T }>();
  const inflight = new Map<string, Promise<T>>();

  const get = (key: string): T | null => {
    const hit = entries.get(key);
    if (!hit) return null;
    if (now() - hit.at > opts.ttlMs) {
      entries.delete(key);
      return null;
    }
    return hit.value;
  };

  const set = (key: string, value: T) => {
    entries.delete(key);
    entries.set(key, { at: now(), value });
    while (entries.size > opts.max) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const load = (key: string, loader: () => Promise<T>): Promise<T> => {
    const hit = get(key);
    if (hit !== null) return Promise.resolve(hit);
    const pending = inflight.get(key);
    if (pending) return pending;
    // A load dropped by delete() must not overwrite (or unregister) a newer one.
    const p: Promise<T> = loader()
      .then((value) => {
        if (inflight.get(key) === p) set(key, value);
        return value;
      })
      .finally(() => {
        if (inflight.get(key) === p) inflight.delete(key);
      });
    inflight.set(key, p);
    return p;
  };

  return {
    get,
    set,
    load,
    prefetch(key, loader) {
      if (get(key) !== null || inflight.has(key)) return;
      load(key, loader).catch(() => undefined);
    },
    delete(key) {
      entries.delete(key);
      inflight.delete(key);
    },
    clear() {
      entries.clear();
      inflight.clear();
    },
  };
}
