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
    .select("iban, account_holder, bank_name, paypal_link, revolut_link")
    .eq("id", row.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    linked: true,
    accountHolder: paymentRow?.account_holder || "",
    bankName: paymentRow?.bank_name || "",
    iban: paymentRow?.iban || "",
    paypal: paymentRow?.paypal_link || "",
    revolut: paymentRow?.revolut_link || "",
  });
}

function stripHandle(raw: string, host: string): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(new RegExp("^" + host + "\\/", "i"), "");
  v = v.replace(/^@/, "");
  return v.trim();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const { rows } = await findCreatorRowsForProfile(supabaseAdmin, userId);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "No linked creator row" }, { status: 404 });

  // Nouveau format : { method: "paypal" | "revolut" | "iban", value, accountHolder?, bankName? }
  const method = body?.method as string | undefined;
  if (method === "paypal" || method === "revolut" || method === "iban") {
    const rawValue = (body?.value as string | undefined)?.trim() || "";
    if (!rawValue) return NextResponse.json({ error: "Missing value" }, { status: 400 });

    // On ne renseigne qu'une seule methode a la fois : on vide les deux autres.
    const update: Record<string, string | null> = {
      paypal_link: null,
      revolut_link: null,
      iban: null,
      account_holder: null,
      bank_name: null,
    };
    if (method === "paypal") {
      update.paypal_link = stripHandle(rawValue, "paypal\\.me");
    } else if (method === "revolut") {
      update.revolut_link = stripHandle(rawValue, "revolut\\.me");
    } else {
      update.iban = rawValue.replace(/\s+/g, "");
      update.account_holder = (body?.accountHolder as string | undefined)?.trim() || null;
      update.bank_name = (body?.bankName as string | undefined)?.trim() || null;
    }

    const { error } = await supabaseAdmin.from("creators").update(update).eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Retrocompat : ancien format IBAN { accountHolder, bankName, iban }
  const accountHolder = (body?.accountHolder as string | undefined)?.trim() || "";
  const bankName = (body?.bankName as string | undefined)?.trim() || "";
  const iban = (body?.iban as string | undefined)?.trim().replace(/\s+/g, "") || "";
  if (!accountHolder || !iban) return NextResponse.json({ error: "Missing account holder or IBAN" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("creators")
    .update({ iban, account_holder: accountHolder, bank_name: bankName, paypal_link: null, revolut_link: null })
    .eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
