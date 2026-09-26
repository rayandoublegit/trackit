import { normalizePlan, type PlanTier } from "@/lib/plan-limits";

/** Ongoing staff grant, until someone revokes it. */
export const COMPED_STATUS = "comped";

export function giftedStatus(days = 30, from = new Date()): string {
  const until = new Date(from.getTime());
  until.setUTCDate(until.getUTCDate() + days);
  return `gifted:${until.toISOString()}`;
}

export type CompAccess = {
  kind: "gift" | "comp" | null;
  until: string | null;
  active: boolean;
};

export function compAccess(status: string | null | undefined, now = Date.now()): CompAccess {
  const raw = (status ?? "").trim();
  const lower = raw.toLowerCase();
  if (lower === COMPED_STATUS) return { kind: "comp", until: null, active: true };
  if (lower.startsWith("gifted:")) {
    const until = raw.slice("gifted:".length);
    const time = Date.parse(until);
    return { kind: "gift", until, active: Number.isFinite(time) && time > now };
  }
  return { kind: null, until: null, active: false };
}

/** Plan the product should enforce. An expired gift falls back to free. */
export function planFromProfile(plan: string | null | undefined, status: string | null | undefined): PlanTier {
  const access = compAccess(status);
  if (access.kind === "gift" && !access.active) return "free";
  return normalizePlan(plan);
}

export function isCompStatus(status: string | null | undefined): boolean {
  return compAccess(status).kind !== null;
}

/** Paid access that must survive a Stripe sync: staff grants and Whop memberships. */
export function grantsAccessWithoutStripe(status: string | null | undefined): boolean {
  if (compAccess(status).active) return true;
  return (status ?? "").toLowerCase().startsWith("whop:");
}

export function whopMembershipId(status: string | null | undefined): string | null {
  const raw = (status ?? "").trim();
  if (!raw.toLowerCase().startsWith("whop:")) return null;
  const id = raw.slice("whop:".length);
  return id && id !== "active" ? id : null;
}
