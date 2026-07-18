import { NextResponse, type NextRequest } from "next/server";
import { getAuthedActorId } from "@/lib/api-auth";
import {
  isValidProfileUsername,
  normalizeProfileUsername,
} from "@/lib/profile-username";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const actorId = await getAuthedActorId(request);
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = normalizeProfileUsername(request.nextUrl.searchParams.get("username") ?? "");
  if (!isValidProfileUsername(username)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", actorId)
    .maybeSingle();

  return NextResponse.json({ available: !data });
}
