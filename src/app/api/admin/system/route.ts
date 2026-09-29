import { NextResponse, type NextRequest } from "next/server";
import { adminDevPreview, requireAdmin } from "@/lib/admin-auth";
import { countRows } from "@/lib/admin-data";
import { devSystem } from "@/lib/admin-dev-fixtures";
import type { SystemCheck, SystemData, TableProbe } from "@/lib/admin-types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Tables the product reads. A missing one breaks the matching feature. */
const EXPECTED_TABLES = [
  "profiles",
  "user_sessions",
  "creators_index",
  "creators",
  "campaigns",
  "campaign_creators",
  "sales",
  "payouts",
  "outreach_history",
  "affiliate_links",
  "creator_content",
  "creator_links",
  "workspaces",
  "workspace_members",
  "rpm_accruals",
  "gift_campaigns",
  "gift_missions",
  "gift_videos",
  "niche_requests",
  "creator_lookup_requests",
  "v2_waitlist",
  "admin_audit_log",
];

function present(name: string): boolean {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeMode: SystemData["stripeMode"] = stripeKey ? (stripeKey.startsWith("sk_live") ? "live" : "test") : "off";

  // Only presence is reported, never a value.
  const env: SystemCheck[] = [
    { key: "supabase", label: "Supabase (URL + public key)", ok: present("NEXT_PUBLIC_SUPABASE_URL") && present("NEXT_PUBLIC_SUPABASE_ANON_KEY") },
    { key: "service", label: "Supabase service key (server)", ok: present("SUPABASE_SERVICE_ROLE_KEY") },
    { key: "stripe", label: "Stripe", ok: stripeMode !== "off", detail: stripeMode === "off" ? "missing" : `${stripeMode} mode` },
    { key: "stripe-webhook", label: "Stripe webhook secret", ok: present("STRIPE_WEBHOOK_SECRET") },
    { key: "whop", label: "Whop (API)", ok: present("WHOP_API_KEY") },
    { key: "whop-webhook", label: "Whop webhook secret", ok: present("WHOP_WEBHOOK_SECRET") },
    { key: "resend", label: "Resend (emails)", ok: present("RESEND_API_KEY") },
    { key: "rapidapi", label: "RapidAPI (creator search)", ok: present("RAPIDAPI_KEY") },
    { key: "scrapecreators", label: "ScrapeCreators (video stats)", ok: present("SCRAPECREATORS_API_KEY") },
    { key: "anthropic", label: "Anthropic (Mino)", ok: present("ANTHROPIC_API_KEY") },
    { key: "shopify", label: "Shopify (app OAuth)", ok: present("SHOPIFY_CLIENT_ID") },
    { key: "cron", label: "Scheduled jobs secret (CRON)", ok: present("CRON_SECRET") },
    { key: "admins", label: "ADMIN_EMAILS list", ok: present("ADMIN_EMAILS"), detail: present("ADMIN_EMAILS") ? undefined : "code default" },
  ];

  const deploy: SystemData["deploy"] = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    region: process.env.VERCEL_REGION ?? null,
  };

  const db = getSupabaseAdmin();
  if (!db) {
    if (adminDevPreview()) return NextResponse.json(devSystem(env, deploy, stripeMode));
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const tables: TableProbe[] = await Promise.all(
    EXPECTED_TABLES.map(async (table) => {
      const r = await countRows(db, table);
      return { table, count: r.count, missing: r.missing, error: r.missing ? null : r.error };
    }),
  );

  const data: SystemData = { ok: true, env, tables, deploy, stripeMode };
  return NextResponse.json(data);
}
