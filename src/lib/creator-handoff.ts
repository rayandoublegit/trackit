// One-shot hand-offs between dashboard screens: a creator picked in Discovery is
// waiting for the campaign or gift screen that opens next. Session storage keeps it
// across the navigation and the reader removes it, so it is used once.

const CAMPAIGN_CREATOR_KEY = "trackit_handoff_campaign_creator";
const GIFT_CREATOR_KEY = "trackit_handoff_gift_creator";
const CAMPAIGNS_TAB_KEY = "trackit_handoff_campaigns_tab";

export type CampaignsHandoffTab = "gifting";

function store(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function put(key: string, value: string) {
  try {
    store()?.setItem(key, value);
  } catch {
    /* storage unavailable: the hand-off is a convenience only */
  }
}

function take(key: string): string | null {
  const s = store();
  if (!s) return null;
  try {
    const value = s.getItem(key);
    s.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

export function normalizeHandoffHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

export function queueCreatorForCampaign(handle: string) {
  const clean = normalizeHandoffHandle(handle);
  if (clean) put(CAMPAIGN_CREATOR_KEY, clean);
}

export function takeCreatorForCampaign(): string | null {
  return take(CAMPAIGN_CREATOR_KEY);
}

export function queueCreatorForGift(handle: string) {
  const clean = normalizeHandoffHandle(handle);
  if (clean) put(GIFT_CREATOR_KEY, clean);
}

export function takeCreatorForGift(): string | null {
  return take(GIFT_CREATOR_KEY);
}

export function requestCampaignsTab(tab: CampaignsHandoffTab) {
  put(CAMPAIGNS_TAB_KEY, tab);
}

export function takeCampaignsTab(): CampaignsHandoffTab | null {
  return take(CAMPAIGNS_TAB_KEY) === "gifting" ? "gifting" : null;
}
