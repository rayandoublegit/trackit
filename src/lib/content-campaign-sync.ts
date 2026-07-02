import type { SupabaseClient } from "@supabase/supabase-js";

/** Associe un contenu aux campagnes qui contiennent ce créateur. */
export async function syncContentToCampaigns(
  admin: SupabaseClient,
  brandId: string,
  creatorRowId: string,
  contentId: string,
): Promise<Error | null> {
  const { data: links, error } = await admin
    .from("campaign_creators")
    .select("campaign_id")
    .eq("user_id", brandId)
    .eq("creator_id", creatorRowId);

  if (error?.message?.includes("campaign_creators")) return null;
  if (error) return new Error(error.message);
  if (!links?.length) return null;

  const rows = links.map((link) => ({
    brand_id: brandId,
    campaign_id: link.campaign_id,
    creator_row_id: creatorRowId,
    content_id: contentId,
  }));

  const { error: upsertErr } = await admin
    .from("campaign_content")
    .upsert(rows, { onConflict: "campaign_id,content_id", ignoreDuplicates: true });

  if (upsertErr?.message?.includes("campaign_content")) return null;
  if (upsertErr) return new Error(upsertErr.message);
  return null;
}
