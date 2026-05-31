import type Stripe from "stripe";

export type BillingPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
};

function formatCardBrand(brand: string | undefined | null): string {
  if (!brand) return "Card";
  if (brand === "amex") return "Amex";
  if (brand === "diners") return "Diners";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function formatCardExpiry(month: number, year: number): string {
  const mm = String(month).padStart(2, "0");
  const yy = String(year).slice(-2);
  return `${mm}/${yy}`;
}

function paymentMethodId(
  ref: string | Stripe.PaymentMethod | null | undefined
): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref.id ?? null;
}

export function stripePaymentMethodToBilling(
  pm: Stripe.PaymentMethod,
  defaultPaymentMethodId: string | null
): BillingPaymentMethod | null {
  if (pm.type !== "card" || !pm.card) return null;
  return {
    id: pm.id,
    brand: formatCardBrand(pm.card.brand),
    last4: pm.card.last4,
    expiry: formatCardExpiry(pm.card.exp_month, pm.card.exp_year),
    isDefault: pm.id === defaultPaymentMethodId,
  };
}

function legacyCardToBilling(
  card: Stripe.Card,
  defaultPaymentMethodId: string | null
): BillingPaymentMethod {
  return {
    id: card.id,
    brand: formatCardBrand(card.brand),
    last4: card.last4,
    expiry: formatCardExpiry(card.exp_month, card.exp_year),
    isDefault: card.id === defaultPaymentMethodId,
  };
}

type InvoiceWithPaymentIntent = Stripe.Invoice & {
  payment_intent?: string | Stripe.PaymentIntent | null;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

export async function listStripeBillingPaymentMethods(
  stripe: Stripe,
  customerId: string,
  options?: { subscriptionId?: string | null }
): Promise<BillingPaymentMethod[]> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return [];

  const defaultPriority: string[] = [];
  const pmById = new Map<string, Stripe.PaymentMethod>();

  const pushPm = (pm: Stripe.PaymentMethod | null | undefined) => {
    if (pm?.type === "card" && pm.card) pmById.set(pm.id, pm);
  };

  const pushDefaultId = (id: string | null) => {
    if (id && !defaultPriority.includes(id)) defaultPriority.push(id);
  };

  const invoiceDefault = customer.invoice_settings?.default_payment_method;
  if (invoiceDefault && typeof invoiceDefault === "object") {
    pushPm(invoiceDefault);
    pushDefaultId(invoiceDefault.id);
  } else {
    pushDefaultId(paymentMethodId(invoiceDefault));
  }

  const subscriptionIds = new Set<string>();
  if (options?.subscriptionId) subscriptionIds.add(options.subscriptionId);

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
    expand: ["data.default_payment_method"],
  });

  for (const sub of subscriptions.data) {
    if (ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status)) {
      subscriptionIds.add(sub.id);
    }
    const subDefault = sub.default_payment_method;
    if (subDefault && typeof subDefault === "object") {
      pushPm(subDefault);
      pushDefaultId(subDefault.id);
    } else {
      pushDefaultId(paymentMethodId(subDefault));
    }
  }

  for (const subId of subscriptionIds) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["default_payment_method"],
      });
      const subDefault = sub.default_payment_method;
      if (subDefault && typeof subDefault === "object") {
        pushPm(subDefault);
        pushDefaultId(subDefault.id);
      } else {
        pushDefaultId(paymentMethodId(subDefault));
      }
    } catch {
      /* subscription may have been deleted */
    }
  }

  const listed = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });
  for (const pm of listed.data) pushPm(pm);

  const paidInvoices = await stripe.invoices.list({
    customer: customerId,
    status: "paid",
    limit: 3,
  });

  for (const invoice of paidInvoices.data) {
    const invPm = invoice.default_payment_method;
    if (invPm && typeof invPm === "object") {
      pushPm(invPm);
      pushDefaultId(invPm.id);
    } else {
      pushDefaultId(paymentMethodId(invPm));
    }

    const paymentIntent = (invoice as InvoiceWithPaymentIntent).payment_intent;
    const piId =
      typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
    if (piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId, {
          expand: ["payment_method"],
        });
        if (pi.payment_method && typeof pi.payment_method === "object") {
          pushPm(pi.payment_method);
          pushDefaultId(pi.payment_method.id);
        } else {
          pushDefaultId(paymentMethodId(pi.payment_method));
        }
      } catch {
        /* ignore */
      }
    }
  }

  for (const id of defaultPriority) {
    if (!pmById.has(id)) {
      try {
        const pm = await stripe.paymentMethods.retrieve(id);
        pushPm(pm);
      } catch {
        /* not a PaymentMethod id */
      }
    }
  }

  if (typeof customer.default_source === "string" && customer.default_source) {
    try {
      const source = await stripe.customers.retrieveSource(
        customerId,
        customer.default_source
      );
      if (source.object === "card") {
        const legacy = legacyCardToBilling(
          source as Stripe.Card,
          defaultPriority[0] ?? null
        );
        const methods = Array.from(pmById.values())
          .map((pm) =>
            stripePaymentMethodToBilling(pm, defaultPriority[0] ?? null)
          )
          .filter((m): m is BillingPaymentMethod => m !== null);
        if (!methods.some((m) => m.last4 === legacy.last4)) {
          methods.unshift({ ...legacy, isDefault: methods.length === 0 });
        }
        return finalizeMethods(methods, defaultPriority[0] ?? legacy.id);
      }
    } catch {
      /* ignore legacy source errors */
    }
  }

  const defaultId =
    defaultPriority.find((id) => pmById.has(id)) ??
    defaultPriority[0] ??
    listed.data[0]?.id ??
    null;

  const methods = Array.from(pmById.values())
    .map((pm) => stripePaymentMethodToBilling(pm, defaultId))
    .filter((m): m is BillingPaymentMethod => m !== null);

  return finalizeMethods(methods, defaultId);
}

function finalizeMethods(
  methods: BillingPaymentMethod[],
  defaultId: string | null
): BillingPaymentMethod[] {
  if (methods.length === 0) return [];
  const hasDefault = methods.some((m) => m.isDefault);
  if (!hasDefault && defaultId) {
    return methods.map((m) => ({ ...m, isDefault: m.id === defaultId }));
  }
  if (!hasDefault) {
    return methods.map((m, i) => ({ ...m, isDefault: i === 0 }));
  }
  return methods;
}
