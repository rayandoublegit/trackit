// Shape of /api/admin/console, used by the Users and Revenue pages.
import type { UserSession, UserUsage } from "@/lib/admin-types";

export type AdminMetrics = {
  mrr: number;
  arr: number;
  activeSubscribers: number;
  trialing: number;
  pastDue: number;
  canceledThisMonth: number;
  newThisMonth: number;
  churnRatePct: number;
  mrrByPlan: Record<string, number>;
  countByPlan: Record<string, number>;
  currency: string;
};

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  plan: string | null;
  role: string | null;
  subscription_active: boolean | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  account_type: string | null;
  created_at: string | null;
};

export type GrowthPoint = { month: string; newSubs: number; canceledSubs: number; netMrrAdded: number };
export type Growth = {
  monthly: GrowthPoint[];
  arpu: number;
  ltv: number;
  funnel: { signups: number; onboarded: number; paying: number; onboardRatePct: number; payRatePct: number };
  currency: string;
};
export type FailedPayment = {
  customerId: string;
  email: string | null;
  amountDue: number;
  currency: string;
  status: string | null;
  created: number;
  hostedUrl: string | null;
};

export type ConsoleData = {
  ok: true;
  metrics: AdminMetrics;
  growth: Growth | null;
  ops: { failedPayments: FailedPayment[]; acquisition: { source: string; count: number }[] };
  users: AdminUser[];
  stripeMode: "live" | "test" | "off";
  me: { email: string; role: string };
};

export type SubDetail = {
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  amount: number;
  currency: string;
  interval: string | null;
  priceId: string | null;
};

export type UserDetail = {
  ok: true;
  profile: Record<string, unknown>;
  subscription: SubDetail | null;
  invoices: { id: string; amountPaid: number; currency: string; status: string | null; created: number; pdf: string | null }[];
  usage?: UserUsage;
  sessions?: UserSession[];
};
