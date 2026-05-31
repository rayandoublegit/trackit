import { supabase } from "@/lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCreatorUuid(id: string): boolean {
  return UUID_RE.test(id);
}

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

async function deleteCreatorViaApi(creatorId?: string, handle?: string): Promise<boolean> {
  const params = new URLSearchParams();
  const id = creatorId && isCreatorUuid(creatorId) ? creatorId : undefined;
  const h = handle?.trim().replace(/^@/, "");
  if (id) params.set("creatorId", id);
  else if (h) params.set("handle", h);
  else return false;

  try {
    const res = await fetch(`/api/creators?${params.toString()}`, { method: "DELETE" });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      console.error("deleteCreator error:", payload.error ?? res.statusText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("deleteCreator error:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Delete by handle (Discovery saved creators). */
export async function removeCreator(_userId: string, handle: string) {
  return deleteCreatorViaApi(undefined, handle);
}

/** Delete by row id (Creators tab); falls back to handle for client-only temp ids. */
export async function deleteCreatorById(_userId: string, creatorId: string, handle?: string) {
  const h = handle?.trim().replace(/^@/, "");
  if (creatorId && isCreatorUuid(creatorId)) {
    const ok = await deleteCreatorViaApi(creatorId);
    if (ok) return true;
  }
  if (h) return deleteCreatorViaApi(undefined, h);
  return false;
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
  follow_up_date?: string | null;
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
