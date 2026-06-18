import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function norm(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
}

// Retrouve la ligne creators du createur (par linked_user_id, sinon par handle puis pose le lien)
async function findCreatorRow(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username, account_type")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.account_type !== "creator") return null;

  const { data: linkedRows } = await supabaseAdmin
    .from("creators")
    .select("id, iban, account_holder, bank_name, handle, linked_user_id")
    .eq("linked_user_id", userId);
  if (linkedRows && linkedRows.length > 0) return linkedRows[0];

  const handle = norm(profile.username);
  if (!handle) return null;
  const { data: all } = await supabaseAdmin
    .from("creators")
    .select("id, iban, account_holder, bank_name, handle, linked_user_id");
  const match = (all || []).find((c) => norm(c.handle) === handle);
  if (match) {
    await supabaseAdmin.from("creators").update({ linked_user_id: userId }).eq("id", match.id);
    return match;
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });
  const row = await findCreatorRow(userId);
  if (!row) return NextResponse.json({ ok: true, linked: false, accountHolder: "", bankName: "", iban: "" });
  return NextResponse.json({
    ok: true,
    linked: true,
    accountHolder: row.account_holder || "",
    bankName: row.bank_name || "",
    iban: row.iban || "",
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  const accountHolder = (body?.accountHolder as string | undefined)?.trim() || "";
  const bankName = (body?.bankName as string | undefined)?.trim() || "";
  const iban = (body?.iban as string | undefined)?.trim().replace(/\s+/g, "") || "";
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });
  if (!accountHolder || !iban) return NextResponse.json({ error: "Missing account holder or IBAN" }, { status: 400 });

  const row = await findCreatorRow(userId);
  if (!row) return NextResponse.json({ error: "No linked creator row" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("creators")
    .update({ iban, account_holder: accountHolder, bank_name: bankName })
    .eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
