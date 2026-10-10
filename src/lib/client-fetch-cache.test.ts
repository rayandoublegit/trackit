import { describe, expect, it, vi } from "vitest";
import { createFetchCache } from "@/lib/client-fetch-cache";

describe("createFetchCache", () => {
  it("shares one request between concurrent loads and serves the result from cache", async () => {
    const cache = createFetchCache<number>({ ttlMs: 1000, max: 10 });
    const loader = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.load("k", loader), cache.load("k", loader)]);
    expect([a, b]).toEqual([42, 42]);
    expect(await cache.load("k", loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("expires entries after the TTL", () => {
    let t = 0;
    const cache = createFetchCache<string>({ ttlMs: 100, max: 10, now: () => t });
    cache.set("k", "v");
    t = 50;
    expect(cache.get("k")).toBe("v");
    t = 151;
    expect(cache.get("k")).toBeNull();
  });

  it("keeps at most `max` entries, dropping the oldest", () => {
    const cache = createFetchCache<number>({ ttlMs: 1000, max: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("does not cache failures, and prefetch swallows them", async () => {
    const cache = createFetchCache<number>({ ttlMs: 1000, max: 10 });
    await expect(cache.load("k", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    cache.prefetch("k", async () => Promise.reject(new Error("y")));
    await new Promise((r) => setTimeout(r, 0));
    expect(cache.get("k")).toBeNull();
    expect(await cache.load("k", async () => 7)).toBe(7);
  });

  it("prefetch skips cached keys", () => {
    const cache = createFetchCache<number>({ ttlMs: 1000, max: 10 });
    cache.set("k", 1);
    const loader = vi.fn(async () => 2);
    cache.prefetch("k", loader);
    expect(loader).not.toHaveBeenCalled();
  });

  it("delete forgets a key, and a load it dropped never overwrites the newer one", async () => {
    const cache = createFetchCache<string>({ ttlMs: 1000, max: 10 });
    cache.set("k", "old");
    cache.delete("k");
    expect(cache.get("k")).toBeNull();

    let finishStale!: (v: string) => void;
    const stale = cache.load("k", () => new Promise<string>((r) => (finishStale = r)));
    cache.delete("k");
    const fresh = await cache.load("k", async () => "new");
    finishStale("stale");
    await stale;
    expect(fresh).toBe("new");
    expect(cache.get("k")).toBe("new");
  });
});
