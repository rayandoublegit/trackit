import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findCreatorRowsForProfile } from "@/lib/creator-account";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const { rows } = await findCreatorRowsForProfile(supabaseAdmin, userId);
  const row = rows[0];
  if (!row) return NextResponse.json({ ok: true, linked: false, accountHolder: "", bankName: "", iban: "" });

  const { data: paymentRow } = await supabaseAdmin
    .from("creators")
    .select("iban, account_holder, bank_name")
    .eq("id", row.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    linked: true,
    accountHolder: paymentRow?.account_holder || "",
    bankName: paymentRow?.bank_name || "",
    iban: paymentRow?.iban || "",
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

  const { rows } = await findCreatorRowsForProfile(supabaseAdmin, userId);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "No linked creator row" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("creators")
    .update({ iban, account_holder: accountHolder, bank_name: bankName })
    .eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
