import type { SupabaseClient } from "@supabase/supabase-js";
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
  revenueRange: string;
  referralSource?: ReferralSource | null;
  referralSocialHandle?: string | null;
  referralDetails?: string | null;
  shopifyStoreUrl?: string | null;
};

export async function saveOnboardingProfileAdmin(
  admin: SupabaseClient,
  userId: string,
  email: string | null | undefined,
  payload: OnboardingSavePayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = normalizeProfileUsername(payload.username);
  if (!isValidProfileUsername(username)) {
    return { ok: false, error: "Invalid username" };
  }

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: email ?? null,
      full_name: payload.fullName.trim(),
      username,
      avatar_url: payload.avatarUrl ?? null,
      business_name: payload.businessName.trim(),
      business_type: payload.businessType,
      niche: payload.niche.trim(),
      revenue_range: payload.revenueRange,
      referral_source: payload.referralSource ?? null,
      shopify_store_url: payload.shopifyStoreUrl?.trim() || null,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    return { ok: false, error: profileErr.message };
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
    if (referralErr) {
      return { ok: false, error: referralErr.message };
    }
  }

  return { ok: true };
}
