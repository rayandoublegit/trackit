import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertProfileRow } from "@/lib/profile-row";
import {
  isValidProfileUsername,
  normalizeProfileUsername,
} from "@/lib/profile-username";
import {
  isSocialReferralSource,
  normalizeSocialHandle,
  type ReferralSource,
} from "@/lib/referral-source";

export type OnboardingSavePayload = {
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  businessName: string;
  businessType: string;
  niche: string;
  revenueRange?: string | null;
  referralSource?: ReferralSource | null;
  referralSocialHandle?: string | null;
  referralDetails?: string | null;
  shopifyStoreUrl?: string | null;
};

export async function saveOnboardingProfileAdmin(
  admin: SupabaseClient,
  userId: string,
  email: string | null | undefined,
  payload: OnboardingSavePayload,
  options?: { markComplete?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const markComplete = options?.markComplete !== false;
  const username = normalizeProfileUsername(payload.username);
  if (!isValidProfileUsername(username)) {
    return { ok: false, error: "Invalid username" };
  }

  const saved = await upsertProfileRow(admin, {
    id: userId,
    email: email ?? null,
    full_name: payload.fullName.trim(),
    username,
    avatar_url: payload.avatarUrl ?? null,
    business_name: payload.businessName.trim(),
    business_type: payload.businessType,
    niche: payload.niche.trim(),
    revenue_range: payload.revenueRange ?? null,
    referral_source: payload.referralSource ?? null,
    shopify_store_url: payload.shopifyStoreUrl?.trim() || null,
    onboarding_completed: markComplete,
    updated_at: new Date().toISOString(),
  });
  if (!saved.ok) return saved;

  try {
    const { data: existingUser } = await admin.auth.admin.getUserById(userId);
    const previous =
      existingUser.user?.user_metadata && typeof existingUser.user.user_metadata === "object"
        ? existingUser.user.user_metadata
        : {};
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...previous,
        onboarding_completed: markComplete,
        full_name: payload.fullName.trim(),
        username,
        business_name: payload.businessName.trim(),
        business_type: payload.businessType,
        niche: payload.niche.trim(),
        revenue_range: payload.revenueRange ?? null,
        referral_source: payload.referralSource ?? null,
        shopify_store_url: payload.shopifyStoreUrl?.trim() || null,
      },
    });
  } catch {
    /* Profile row is the source of truth when those columns exist. */
  }

  if (payload.referralSource) {
    const { error: referralErr } = await admin.from("user_referral_attributions").upsert(
      {
        user_id: userId,
        source: payload.referralSource,
        social_handle: isSocialReferralSource(payload.referralSource)
          ? normalizeSocialHandle(payload.referralSocialHandle ?? "")
          : null,
        details: !isSocialReferralSource(payload.referralSource)
          ? payload.referralDetails?.trim() || null
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    const referralMessage = referralErr?.message ?? "";
    const referralMissing =
      referralMessage.includes("schema cache") ||
      referralMessage.includes("does not exist") ||
      referralMessage.includes("Could not find");
    if (referralErr && !referralMissing) {
      return { ok: false, error: referralErr.message };
    }
  }

  return { ok: true };
}
