import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getActiveSubscriptionInfo, resolveStripeCustomerId } from "@/lib/stripe-billing";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";

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

/** Next charge date from active subscription or invoice fallbacks. */
async function resolveNextBillingDate(
  stripe: Stripe,
  customerId: string,
  invoices: Stripe.Invoice[]
): Promise<number | null> {
  const subscriptionInfo = await getActiveSubscriptionInfo(stripe, customerId);
  if (subscriptionInfo?.nextBillingDate) {
    return subscriptionInfo.nextBillingDate;
  }

  const openInvoice = invoices.find((inv) => inv.status === "open");
  if (openInvoice?.due_date) return openInvoice.due_date;
  if (openInvoice?.period_end) return openInvoice.period_end;

  const lastPaid = invoices.find((inv) => inv.status === "paid");
  if (lastPaid?.period_end && lastPaid.period_start) {
    const cycleSeconds = lastPaid.period_end - lastPaid.period_start;
    if (cycleSeconds > 0) {
      const projected = lastPaid.period_end + cycleSeconds;
      if (projected * 1000 > Date.now()) return projected;
    }
    return lastPaid.period_end;
  }

  const draftOrPending = invoices.find(
    (inv) => inv.status === "draft" && (inv.amount_due ?? inv.total ?? 0) > 0
  );
  if (draftOrPending?.period_end) return draftOrPending.period_end;

  return null;
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
  const workspace = await resolveWorkspaceContextForUser(user);

  try {
    const customerId = await resolveStripeCustomerId(
      admin,
      stripe,
      workspace.ownerId,
      workspace.ownerEmail
    );

    if (!customerId) {
      return NextResponse.json({
        invoices: [] as InvoiceListItem[],
        nextBillingDate: null,
      });
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

    const nextBillingDate = await resolveNextBillingDate(
      stripe,
      customerId,
      all
    );

    return NextResponse.json({ invoices, nextBillingDate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load invoices";
    console.error("invoices API:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
