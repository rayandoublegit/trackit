import { supabase } from "@/lib/supabase";

// CREATORS
export async function saveCreator(userId: string, creator: {
  username: string;
  display_name: string;
  avatar_url: string;
  platform: string;
  followers_count: number;
  engagement_rate: number;
  avg_views: number;
  bio: string;
  niche: string;
}) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("creators")
    .upsert({
      user_id: userId,
      handle: creator.username,
      full_name: creator.display_name,
      avatar_url: creator.avatar_url,
      platform: creator.platform,
      followers: creator.followers_count,
      engagement_rate: creator.engagement_rate,
      niche: creator.niche,
    }, { onConflict: "user_id,handle" })
    .select()
    .single();
  if (error) console.error("saveCreator error:", error);
  return data;
}

export async function getSavedCreators(userId: string) {
  if (!supabase) return [];
  const { data } = await supabase
    .from("creators")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function removeCreator(userId: string, username: string) {
  if (!supabase) return;
  await supabase
    .from("creators")
    .delete()
    .eq("user_id", userId)
    .eq("username", username);
}

// CAMPAIGNS
export async function saveCampaign(userId: string, campaign: {
  name: string;
  description?: string;
  platform: string;
  start_date?: string;
  end_date?: string;
  commission_type: string;
  commission_rate: number;
  auto_payout: boolean;
  status: string;
}) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ user_id: userId, ...campaign })
    .select()
    .single();
  if (error) console.error("saveCampaign error:", error);
  return data;
}

export async function getCampaigns(userId: string) {
  if (!supabase) return [];
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function updateCampaignStatus(campaignId: string, status: string) {
  if (!supabase) return;
  await supabase
    .from("campaigns")
    .update({ status })
    .eq("id", campaignId);
}

// OUTREACH
export async function saveOutreach(userId: string, outreach: {
  creator_username: string;
  creator_display_name: string;
  creator_avatar: string;
  platform: string;
  message: string;
  status: string;
}) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("outreach_history")
    .insert({ user_id: userId, ...outreach })
    .select()
    .single();
  if (error) console.error("saveOutreach error:", error);
  return data;
}

export async function getOutreachHistory(userId: string) {
  if (!supabase) return [];
  const { data } = await supabase
    .from("outreach_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function updateOutreachStatus(outreachId: string, status: string) {
  if (!supabase) return;
  await supabase
    .from("outreach_history")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", outreachId);
}
