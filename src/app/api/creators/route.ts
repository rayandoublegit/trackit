import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuthedUser(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user;
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("creatorId")?.trim();
  const creatorId = rawId && UUID_RE.test(rawId) ? rawId : undefined;
  const handle = searchParams.get("handle")?.trim()?.replace(/^@/, "");
  if (!creatorId && !handle) {
    return NextResponse.json({ error: "Missing creatorId or handle" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let query = admin.from("creators").delete().eq("user_id", user.id);
  if (creatorId) query = query.eq("id", creatorId);
  else if (handle) query = query.eq("handle", handle);

  const { data, error } = await query.select("id");

  if (error) {
    console.error("DELETE /api/creators error:", error.message, error.code, error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
