import type { ReferralSource } from "@/lib/referral-source";

const STORAGE_KEY = "trackit_onboarding_draft_v1";

export type OnboardingDraftStep = 1 | 2 | 3 | 4;

export type OnboardingDraft = {
  userId: string;
  step: OnboardingDraftStep;
  fullName: string;
  username: string;
  avatarPreviewUrl: string | null;
  businessName: string;
  businessType: "ecommerce" | "infopreneur" | "agency" | "other" | null;
  niche: string;
  revenue: "starting" | "1k-10k" | "10k-50k" | "50k+" | null;
  source: ReferralSource | null;
  sourceHandle: string;
  sourceDetails: string;
  shopifyUrl: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function readOnboardingDraft(userId: string): OnboardingDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (parsed.userId !== userId) return null;
    if (parsed.step < 1 || parsed.step > 4) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOnboardingDraft(draft: OnboardingDraft): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearOnboardingDraft(): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function onboardingStepFromUrl(): OnboardingDraftStep | null {
  if (typeof window === "undefined") return null;
  const step = new URLSearchParams(window.location.search).get("step");
  if (step === "1") return 1;
  if (step === "2") return 2;
  if (step === "3") return 3;
  if (step === "4") return 4;
  return null;
}
