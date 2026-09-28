// Shapes returned by the staff console API, shared by routes and pages.
import type { Bucket, DayPoint } from "@/lib/admin-aggregate";

export type { Bucket, DayPoint };

export type AttentionItem = {
  kind: "billing" | "requests" | "lookups" | "schema" | "error";
  label: string;
  count: number;
  href: string;
};

export type OverviewData = {
  ok: true;
  generatedAt: string;
  users: {
    total: number | null;
    brands: number | null;
    creators: number | null;
    new7d: number | null;
    newPrev7d: number | null;
    signups: DayPoint[] | null;
  };
  active: { d1: number | null; d7: number | null; d30: number | null };
  paying: { count: number | null; comped: number | null; mrrEstimate: number | null; byPlan: Bucket[] };
  campaigns: { total: number | null; active: number | null };
  sales: { count30d: number | null; revenue30d: number | null; revenuePrev30d: number | null; series: DayPoint[] | null };
  catalog: { total: number | null };
  gifting: { missions: number | null };
  attention: AttentionItem[];
  warnings: string[];
};

export type ActivityData = {
  ok: true;
  generatedAt: string;
  campaigns: { byStatus: Bucket[]; created: DayPoint[] } | null;
  sales: { series: DayPoint[]; count: number; revenue: number; commission: number } | null;
  topBrands: { userId: string; label: string; revenue: number; orders: number }[] | null;
  payouts: { byStatus: { key: string; count: number; amount: number }[] } | null;
  outreach: { sent30d: number; series: DayPoint[] } | null;
  gifting: { byStatus: Bucket[] } | null;
  content: { uploads30d: number; series: DayPoint[] } | null;
  warnings: string[];
};

export type RequestGroup = { key: string; label: string; count: number; last: string | null };

export type RequestsData = {
  ok: true;
  niches: RequestGroup[] | null;
  lookups: RequestGroup[] | null;
  waitlist: { email: string; first_name: string | null; expectations: string | null; created_at: string | null }[] | null;
  warnings: string[];
};

export type SystemCheck = { key: string; label: string; ok: boolean; detail?: string };
export type TableProbe = { table: string; count: number | null; missing: boolean; error: string | null };

export type SystemData = {
  ok: true;
  env: SystemCheck[];
  tables: TableProbe[];
  deploy: { commit: string | null; branch: string | null; environment: string; region: string | null };
  stripeMode: "live" | "test" | "off";
};

export type AuditData = {
  ok: true;
  missing: boolean;
  entries: {
    id: string;
    actor_email: string;
    action: string;
    target_user_id: string | null;
    target_email: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  }[];
};

export type UserUsage = {
  campaigns: number | null;
  creators: number | null;
  sales: number | null;
  salesRevenue: number | null;
  outreach: number | null;
  giftMissions: number | null;
};

export type UserSession = {
  device_label: string | null;
  location_label: string | null;
  ip_address: string | null;
  last_active_at: string | null;
};
