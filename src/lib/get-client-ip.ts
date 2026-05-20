import type { NextRequest } from "next/server";

/** Client IP from proxy headers (Vercel, Cloudflare, etc.). */
export function getClientIp(request: NextRequest | Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return null;
}
