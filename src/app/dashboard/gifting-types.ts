import type { GiftCreatorStats } from "@/lib/gift-share";

// Rows of /api/gifting as the brand's Gifting view reads them. Columns added by
// migration 000051 are optional: a database without it still renders.

export type GiftCampaignUi = {
  id: string;
  name: string;
  product: string;
  brief: string;
  deadline: string;
  status?: string;
  video_count?: number;
  allow_ads: boolean;
  rights_days: number;
  territories: string;
  share_token?: string | null;
  share_enabled?: boolean | null;
  spots?: number | null;
  auto_approve?: boolean | null;
  offer?: string | null;
  product_value_cents?: number | null;
  product_images?: string[] | null;
  min_followers?: number | null;
  platforms?: string[] | null;
  countries?: string[] | null;
};

export type GiftMissionUi = {
  id: string;
  campaign_id: string;
  creator_handle: string;
  creator_platform: string;
  creator_user_id?: string | null;
  status: string;
  contract_text: string;
  signed_name: string | null;
  signed_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  address: { name: string; line: string; postalCode: string; city: string; country: string } | null;
  source?: string | null;
  application_message?: string | null;
  applied_at?: string | null;
  creator_stats?: GiftCreatorStats | null;
};
