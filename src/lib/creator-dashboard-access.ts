/** Creator ↔ brand link statuses (creator_links.status). */
export const CREATOR_LINK_STATUS = {
  pendingReview: "pending_review",
  active: "active",
  ignored: "ignored",
  revoked: "revoked",
} as const;

/** Statuses that allow the creator to use their dashboard (before/after brand approval). */
export const CREATOR_DASHBOARD_ACCESS_STATUSES = [
  CREATOR_LINK_STATUS.pendingReview,
  CREATOR_LINK_STATUS.active,
] as const;

/** Statuses shown in the brand « dashboards actifs » table. */
export const CREATOR_DASHBOARD_LISTED_STATUSES = [CREATOR_LINK_STATUS.active] as const;

export type CreatorLinkStatus = (typeof CREATOR_LINK_STATUS)[keyof typeof CREATOR_LINK_STATUS];
