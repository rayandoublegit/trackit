"use client";

import type { PlanTier } from "@/lib/plan-limits";
import type { FeedCreator } from "@/lib/discovery-feed";
import { CreatorManageLists } from "./CreatorManageLists";

export function CreatorsView({
  isMobile,
  plan = "free",
  onUpgrade,
  onUpgradePro,
  userId,
  onReachOut,
}: {
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  userId?: string;
  onReachOut?: (creator: FeedCreator) => void;
}) {
  return <CreatorManageLists isMobile={isMobile} plan={plan} workspaceUserId={userId} onUpgrade={onUpgrade} onUpgradePro={onUpgradePro} onReachOut={onReachOut} />;
}
