import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { grantsAccessWithoutStripe, whopMembershipId } from "@/lib/comp-plan";
import { updateProfileRow } from "@/lib/profile-row";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cancelWhopMembership } from "@/lib/whop";

export const dynamic = "force-dynamic";

function verifyWhopSignature(raw: string, request: NextRequest, secret: string): boolean {
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return signature.split(" ").some((part) => {
    const value = part.startsWith("v1,") ? part.slice(3) : part;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function membershipIdFrom(data: Record<string, unknown>): string {
  const nested = asRecord(data.membership);
  const candidates = [nested?.id, data.membership_id, data.id];
  for (const candidate of candidates) {
    const id = String(candidate ?? "");
    if (id.startsWith("mem_")) return id;
  }
  return "";
}

function readMeta(data: Record<string, unknown>): { userId: string; plan: PlanTier; email: string; membershipId: string } {
  const planRecord = asRecord(data.plan);
  const meta = asRecord(data.metadata) ?? asRecord(planRecord?.metadata) ?? {};
  const user = asRecord(data.user);
  const planRaw = String(meta.plan ?? "");
  return {
    userId: String(meta.userId ?? meta.user_id ?? ""),
    plan: normalizePlan(planRaw === "growth" ? "basic" : planRaw),
    email: String(meta.email ?? user?.email ?? ""),
    membershipId: membershipIdFrom(data),
  };
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (secret && !verifyWhopSignature(raw, request, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const type = String(body.type ?? body.event ?? "");
  const data = asRecord(body.data) ?? body;
  const activating = type === "payment.succeeded" || type === "membership.activated";
  const ending = type === "membership.deactivated";
  if (!activating && !ending) return NextResponse.json({ ok: true, ignored: type });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const meta = readMeta(data);
  let userId = meta.userId;
  if (!userId && meta.email) {
    const { data: profile } = await db.from("profiles").select("id").eq("email", meta.email).maybeSingle();
    userId = profile?.id ?? "";
  }
  if (!userId) return NextResponse.json({ ok: true, ignored: "no user" });

  if (ending) {
    const { data: profile } = await db.from("profiles").select("subscription_status").eq("id", userId).maybeSingle();
    const current = whopMembershipId(profile?.subscription_status);
    if (current && meta.membershipId && current !== meta.membershipId) {
      return NextResponse.json({ ok: true, ignored: "older membership" });
    }
    if (!grantsAccessWithoutStripe(profile?.subscription_status) && !String(profile?.subscription_status ?? "").startsWith("whop:")) {
      return NextResponse.json({ ok: true, ignored: "not whop" });
    }
    const saved = await updateProfileRow(db, userId, {
      plan: "free",
      subscription_active: false,
      subscription_status: "inactive",
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (meta.plan === "free") return NextResponse.json({ ok: true, ignored: "no plan" });

  const { data: existing } = await db.from("profiles").select("subscription_status").eq("id", userId).maybeSingle();
  const previous = whopMembershipId(existing?.subscription_status);
  if (previous && meta.membershipId && previous !== meta.membershipId) {
    try {
      await cancelWhopMembership(previous);
    } catch (err) {
      console.error("whop cancel previous membership", err instanceof Error ? err.message : "failed");
    }
  }

  const saved = await updateProfileRow(db, userId, {
    plan: meta.plan,
    subscription_active: true,
    subscription_status: meta.membershipId ? `whop:${meta.membershipId}` : "whop:active",
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
