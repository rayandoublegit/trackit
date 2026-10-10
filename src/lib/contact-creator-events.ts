// "Contact this creator" from anywhere in the brand dashboard (creator page,
// drawers, Mino cards, lists). The ContactCreatorHost mounted once in the
// dashboard listens and opens the email composer.

export const CONTACT_CREATOR_EVENT = "trackit:contact-creator";

export type ContactCreatorTarget = {
  username: string;
  displayName?: string | null;
  platform?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  niche?: string | null;
  primaryNiche?: string | null;
  followersCount?: number | null;
  engagementRate?: number | null;
  bio?: string | null;
  /** The plan hides creator emails (Free): `hasEmail` says whether one exists. */
  hasEmail?: boolean;
  emailLocked?: boolean;
  /** Already written (e.g. by the Outreach AI panel): shown as is, no new draft. */
  draft?: { subject: string; body: string } | null;
};

export function requestContactCreator(target: ContactCreatorTarget): void {
  if (typeof window === "undefined" || !target?.username) return;
  window.dispatchEvent(new CustomEvent<ContactCreatorTarget>(CONTACT_CREATOR_EVENT, { detail: target }));
}
