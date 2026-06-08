import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const firstName = String(body.firstName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const expectations = String(body.expectations || "").trim();

  if (!firstName || !email) {
    return NextResponse.json({ ok: false, error: "name and email required" }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid email" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("v2_waitlist")
    .insert({ first_name: firstName, email, expectations: expectations || null });

  if (error) {
    // duplicate email = already on the list, treat as success
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, alreadyOnList: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
