/** Module-level TikTok scrape concurrency limiter (per server instance). */

const MAX_CONCURRENT_SCRAPES = 3;

let activeScrapes = 0;

/** Try to reserve a scrape slot. Returns false if already at capacity (no queue). */
export function tryAcquireAvatarScrapeSlot(): boolean {
  if (activeScrapes >= MAX_CONCURRENT_SCRAPES) return false;
  activeScrapes += 1;
  return true;
}

export function releaseAvatarScrapeSlot(): void {
  activeScrapes = Math.max(0, activeScrapes - 1);
}

export function avatarScrapeSlotsInUse(): number {
  return activeScrapes;
}
