import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("outreach_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET /api/outreach error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (body.userId && String(body.userId) !== userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const row = {
    user_id: userId,
    creator_username: String(body.creator_username || "").replace(/^@/, ""),
    creator_display_name: String(body.creator_display_name || ""),
    creator_avatar: String(body.creator_avatar || ""),
    platform: String(body.platform || ""),
    message: String(body.message || ""),
    status: String(body.status || "sent"),
    follow_up_date: body.follow_up_date ? String(body.follow_up_date) : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.from("outreach_history").insert(row).select().single();
  if (error) {
    console.error("POST /api/outreach error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data });
}

export async function PATCH(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const outreachId = String(body.outreachId || "");
  if (body.userId && String(body.userId) !== userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!outreachId) {
    return NextResponse.json({ ok: false, error: "Missing outreachId" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) patch.status = String(body.status);
  if (body.follow_up_date !== undefined) {
    patch.follow_up_date = body.follow_up_date ? String(body.follow_up_date) : null;
  }

  const { data, error } = await supabaseAdmin
    .from("outreach_history")
    .update(patch)
    .eq("id", outreachId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("PATCH /api/outreach error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin.from("outreach_history").delete().eq("user_id", userId);
  if (error) {
    console.error("DELETE /api/outreach error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
