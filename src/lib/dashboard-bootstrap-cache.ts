import type { User } from "@supabase/supabase-js";
import type { OnboardingSavePayload } from "@/lib/onboarding-save";
import { normalizePlan } from "@/lib/plan-limits";
import { normalizeProfileUsername } from "@/lib/profile-username";

export type DashboardBootstrapCache = {
  userId: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  business_name: string | null;
  shopify_store: string | null;
  plan: string;
  account_type: string | null;
  isCreator: boolean;
  onboarding_completed: boolean;
};

const STORAGE_KEY = "trackit_dashboard_bootstrap_v1";

export function readDashboardBootstrap(userId: string): DashboardBootstrapCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardBootstrapCache;
    if (!parsed || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDashboardBootstrap(cache: DashboardBootstrapCache): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
}

export function patchDashboardBootstrap(
  userId: string,
  patch: Partial<Pick<DashboardBootstrapCache, "full_name" | "username" | "avatar_url" | "business_name" | "shopify_store" | "plan">>,
): void {
  const existing = readDashboardBootstrap(userId);
  if (!existing) return;
  writeDashboardBootstrap({ ...existing, ...patch });
}

export function clearDashboardBootstrap(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function buildBootstrapFromOnboarding(
  user: User,
  payload: OnboardingSavePayload,
  options?: { plan?: string; accountType?: string | null }
): DashboardBootstrapCache {
  const shopifyStore = payload.shopifyStoreUrl?.trim() || null;
  return {
    userId: user.id,
    email: user.email ?? null,
    full_name: payload.fullName.trim(),
    username: normalizeProfileUsername(payload.username),
    avatar_url: payload.avatarUrl ?? null,
    business_name: payload.businessName.trim(),
    shopify_store: shopifyStore,
    plan: normalizePlan(options?.plan ?? "free"),
    account_type: options?.accountType ?? null,
    isCreator: options?.accountType === "creator",
    onboarding_completed: true,
  };
}

type ProfileBootstrapSource = {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  business_name: string | null;
  shopify_store?: string | null;
  plan: string | null;
  account_type?: string | null;
  onboarding_completed?: boolean | null;
};

export function buildBootstrapFromProfile(
  user: User,
  profile: ProfileBootstrapSource
): DashboardBootstrapCache {
  const isCreator = profile.account_type === "creator";
  return {
    userId: user.id,
    email: user.email ?? null,
    full_name: profile.full_name,
    username: profile.username,
    avatar_url: profile.avatar_url,
    business_name: profile.business_name,
    shopify_store: profile.shopify_store ?? null,
    plan: normalizePlan(profile.plan),
    account_type: profile.account_type ?? null,
    isCreator,
    onboarding_completed: isCreator || profile.onboarding_completed !== false,
  };
}
