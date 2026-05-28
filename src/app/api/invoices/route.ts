import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId } from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

export type InvoiceDisplayStatus = "Paid" | "Pending" | "Failed";

export type InvoiceListItem = {
  id: string;
  created: number;
  amount: number;
  currency: string;
  status: InvoiceDisplayStatus;
  pdfUrl: string | null;
};

function mapInvoiceStatus(status: Stripe.Invoice.Status): InvoiceDisplayStatus {
  if (status === "paid") return "Paid";
  if (status === "open" || status === "draft") return "Pending";
  return "Failed";
}

function invoiceAmount(invoice: Stripe.Invoice): number {
  const cents =
    invoice.status === "paid"
      ? invoice.amount_paid
      : invoice.total ?? invoice.amount_due ?? 0;
  return cents / 100;
}

function invoicePdfUrl(invoice: Stripe.Invoice): string | null {
  return invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null;
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !stripeKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

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

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  try {
    const customerId = await resolveStripeCustomerId(
      admin,
      stripe,
      user.id,
      user.email
    );

    if (!customerId) {
      return NextResponse.json({ invoices: [] as InvoiceListItem[] });
    }

    const all: Stripe.Invoice[] = [];
    let startingAfter: string | undefined;

    do {
      const page = await stripe.invoices.list({
        customer: customerId,
        limit: 100,
        starting_after: startingAfter,
      });
      all.push(...page.data);
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1]?.id;
    } while (startingAfter);

    const invoices: InvoiceListItem[] = all
      .filter((inv) => inv.status !== "draft" || (inv.total ?? 0) > 0)
      .map((inv) => ({
        id: inv.id,
        created: inv.created,
        amount: invoiceAmount(inv),
        currency: (inv.currency ?? "usd").toUpperCase(),
        status: mapInvoiceStatus(inv.status ?? "open"),
        pdfUrl: invoicePdfUrl(inv),
      }))
      .sort((a, b) => b.created - a.created);

    return NextResponse.json({ invoices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load invoices";
    console.error("invoices API:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
