import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function deviceFrom(ua: string): string {
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return "tablet";
  if (/mobile|iphone|android/.test(u)) return "mobile";
  return "desktop";
}

function refDomain(ref: string | null): string | null {
  if (!ref) return null;
  try { return new URL(ref).hostname.replace(/^www\./, ""); } catch { return null; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { data: link } = await supa
    .from("affiliate_links")
    .select("id, destination_url, active")
    .eq("slug", slug)
    .maybeSingle();

  if (!link || !link.active) {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  const ua = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const country = req.headers.get("x-vercel-ip-country") || null;
  const ipHash = ip ? createHash("sha256").update(ip + slug).digest("hex").slice(0, 24) : null;

  // Awaited on purpose: fire-and-forget inserts get killed when the redirect
  // response is sent (Next/Vercel), so the click would never be logged.
  const { error: clickErr } = await supa.from("link_clicks").insert({
    link_id: link.id,
    ref_code: slug,
    country,
    device: deviceFrom(ua),
    referrer_domain: refDomain(req.headers.get("referer")),
    ip_hash: ipHash,
  });
  if (clickErr) console.error("[l/slug] click insert failed:", clickErr.message);

  // Always land on the destination base (origin), with ref for attribution.
  let dest: URL;
  try {
    const raw = String(link.destination_url || "").trim();
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    dest = new URL(new URL(withProtocol).origin);
  } catch {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }
  if (!dest.searchParams.has("ref")) dest.searchParams.set("ref", slug);
  return NextResponse.redirect(dest.toString(), 302);
}
