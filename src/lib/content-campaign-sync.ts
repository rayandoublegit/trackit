import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCreatorHandle } from "@/lib/creator-account";

type CreatorMembership = {
  creatorRowId: string;
  linkedUserId: string | null;
};

async function loadCampaignCreators(
  admin: SupabaseClient,
  brandId: string,
  campaignId: string,
): Promise<{ members: CreatorMembership[]; error: Error | null }> {
  const { data: links, error } = await admin
    .from("campaign_creators")
    .select("creator_id")
    .eq("user_id", brandId)
    .eq("campaign_id", campaignId);

  if (error?.message?.includes("campaign_creators")) {
    return { members: [], error: null };
  }
  if (error) return { members: [], error: new Error(error.message) };

  const creatorRowIds = [...new Set((links || []).map((link) => String(link.creator_id)).filter(Boolean))];
  if (creatorRowIds.length === 0) return { members: [], error: null };

  const { data: creators, error: creatorErr } = await admin
    .from("creators")
    .select("id, linked_user_id, handle")
    .eq("user_id", brandId)
    .in("id", creatorRowIds);

  if (creatorErr) return { members: [], error: new Error(creatorErr.message) };

  return {
    members: (creators || []).map((row) => ({
      creatorRowId: String(row.id),
      linkedUserId: row.linked_user_id ? String(row.linked_user_id) : null,
    })),
    error: null,
  };
}

async function loadCreatorContentForMembers(
  admin: SupabaseClient,
  brandId: string,
  members: CreatorMembership[],
) {
  if (members.length === 0) return { data: [] as { id: string; creator_row_id: string; creator_user_id?: string | null }[], error: null as Error | null };

  const creatorRowIds = members.map((m) => m.creatorRowId);
  const linkedUserIds = [...new Set(members.map((m) => m.linkedUserId).filter(Boolean))] as string[];

  const select = "id, creator_row_id, creator_user_id";
  const byRow =
    creatorRowIds.length > 0
      ? await admin.from("creator_content").select(select).eq("brand_id", brandId).in("creator_row_id", creatorRowIds)
      : { data: [] as { id: string; creator_row_id: string; creator_user_id?: string | null }[], error: null };

  if (byRow.error?.message?.includes("creator_content")) {
    return { data: [], error: null };
  }
  if (byRow.error) return { data: [], error: new Error(byRow.error.message) };

  const byUser =
    linkedUserIds.length > 0
      ? await admin.from("creator_content").select(select).eq("brand_id", brandId).in("creator_user_id", linkedUserIds)
      : { data: [] as { id: string; creator_row_id: string; creator_user_id?: string | null }[], error: null };

  if (byUser.error?.message?.includes("creator_content")) {
    return { data: byRow.data || [], error: null };
  }
  if (byUser.error) return { data: [], error: new Error(byUser.error.message) };

  const merged = new Map<string, { id: string; creator_row_id: string; creator_user_id?: string | null }>();
  for (const row of [...(byRow.data || []), ...(byUser.data || [])]) {
    merged.set(row.id, row);
  }

  return { data: [...merged.values()], error: null };
}

async function upsertCampaignContentLinks(
  admin: SupabaseClient,
  brandId: string,
  campaignId: string,
  rows: { contentId: string; creatorRowId: string }[],
): Promise<Error | null> {
  if (rows.length === 0) return null;

  const payload = rows.map((row) => ({
    brand_id: brandId,
    campaign_id: campaignId,
    creator_row_id: row.creatorRowId,
    content_id: row.contentId,
  }));

  const { error } = await admin
    .from("campaign_content")
    .upsert(payload, { onConflict: "campaign_id,content_id", ignoreDuplicates: true });

  if (error?.message?.includes("campaign_content")) return null;
  if (error) return new Error(error.message);
  return null;
}

function resolveCreatorRowIdForContent(
  members: CreatorMembership[],
  content: { creator_row_id: string; creator_user_id?: string | null },
): string {
  const direct = members.find((m) => m.creatorRowId === content.creator_row_id);
  if (direct) return direct.creatorRowId;

  const linkedUserId = content.creator_user_id ? String(content.creator_user_id) : null;
  if (linkedUserId) {
    const byUser = members.find((m) => m.linkedUserId === linkedUserId);
    if (byUser) return byUser.creatorRowId;
  }

  return content.creator_row_id;
}

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

  for (const link of links) {
    const err = await upsertCampaignContentLinks(admin, brandId, String(link.campaign_id), [
      { contentId, creatorRowId },
    ]);
    if (err) return err;
  }

  return null;
}

/** Rattache tout le contenu existant d'un créateur aux campagnes où il est membre. */
export async function backfillCreatorContentToCampaigns(
  admin: SupabaseClient,
  brandId: string,
  creatorRowId: string,
): Promise<Error | null> {
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id, linked_user_id")
    .eq("id", creatorRowId)
    .eq("user_id", brandId)
    .maybeSingle();

  if (creatorErr) return new Error(creatorErr.message);
  if (!creator) return null;

  const members: CreatorMembership[] = [
    {
      creatorRowId: String(creator.id),
      linkedUserId: creator.linked_user_id ? String(creator.linked_user_id) : null,
    },
  ];

  const { data: contentRows, error: contentErr } = await loadCreatorContentForMembers(admin, brandId, members);
  if (contentErr) return contentErr;
  if (contentRows.length === 0) return null;

  const { data: campaignLinks, error: linkErr } = await admin
    .from("campaign_creators")
    .select("campaign_id")
    .eq("user_id", brandId)
    .eq("creator_id", creatorRowId);

  if (linkErr?.message?.includes("campaign_creators")) return null;
  if (linkErr) return new Error(linkErr.message);
  if (!campaignLinks?.length) return null;

  for (const link of campaignLinks) {
    const campaignId = String(link.campaign_id);
    const err = await upsertCampaignContentLinks(
      admin,
      brandId,
      campaignId,
      contentRows.map((row) => ({
        contentId: row.id,
        creatorRowId: resolveCreatorRowIdForContent(members, row),
      })),
    );
    if (err) return err;
  }

  return null;
}

/** Synchronise le contenu de tous les créateurs membres d'une campagne. */
export async function backfillCampaignContent(
  admin: SupabaseClient,
  brandId: string,
  campaignId: string,
): Promise<Error | null> {
  const { members, error } = await loadCampaignCreators(admin, brandId, campaignId);
  if (error) return error;
  if (members.length === 0) return null;

  const { data: contentRows, error: contentErr } = await loadCreatorContentForMembers(admin, brandId, members);
  if (contentErr) return contentErr;
  if (contentRows.length === 0) return null;

  return upsertCampaignContentLinks(
    admin,
    brandId,
    campaignId,
    contentRows.map((row) => ({
      contentId: row.id,
      creatorRowId: resolveCreatorRowIdForContent(members, row),
    })),
  );
}

/** IDs de contenu visibles dans une campagne (avec backfill automatique). */
export async function resolveCampaignContentIds(
  admin: SupabaseClient,
  brandId: string,
  campaignId: string,
): Promise<{ ids: string[]; error: Error | null }> {
  const { members, error: membersErr } = await loadCampaignCreators(admin, brandId, campaignId);
  if (membersErr) return { ids: [], error: membersErr };
  if (members.length === 0) return { ids: [], error: null };

  await backfillCampaignContent(admin, brandId, campaignId);

  const { data: contentRows, error: contentErr } = await loadCreatorContentForMembers(admin, brandId, members);
  if (contentErr) return { ids: [], error: contentErr };

  const ids = [...new Set(contentRows.map((row) => row.id))];
  return { ids, error: null };
}

/** Résout les lignes créateur d'une marque pour un pseudo (normalisé). */
export async function resolveCreatorRowIdsByHandle(
  admin: SupabaseClient,
  brandId: string,
  targetHandle: string,
): Promise<string[]> {
  const normalized = normalizeCreatorHandle(targetHandle);
  if (!normalized) return [];

  const { data: creators, error } = await admin
    .from("creators")
    .select("id, handle, linked_user_id")
    .eq("user_id", brandId);

  if (error) return [];

  const matching = (creators || []).filter((row) => normalizeCreatorHandle(row.handle) === normalized);
  const ids = new Set(matching.map((row) => String(row.id)));

  const linkedUserIds = matching.map((row) => row.linked_user_id).filter(Boolean) as string[];
  if (linkedUserIds.length > 0) {
    for (const row of creators || []) {
      if (row.linked_user_id && linkedUserIds.includes(String(row.linked_user_id))) {
        ids.add(String(row.id));
      }
    }
  }

  return [...ids];
}

export async function loadBrandContentForCreators(
  admin: SupabaseClient,
  brandId: string,
  creatorRowIds: string[],
  linkedUserIds: string[] = [],
) {
  if (creatorRowIds.length === 0 && linkedUserIds.length === 0) {
    return { data: [] as Record<string, unknown>[], error: null as Error | null };
  }

  const select =
    "id, title, notes, file_url, file_name, file_type, file_size, creator_row_id, creator_user_id, created_at";

  const byRow =
    creatorRowIds.length > 0
      ? await admin
          .from("creator_content")
          .select(select)
          .eq("brand_id", brandId)
          .in("creator_row_id", creatorRowIds)
          .order("created_at", { ascending: false })
      : { data: [] as Record<string, unknown>[], error: null };

  if (byRow.error?.message?.includes("creator_content")) {
    return { data: [], error: null };
  }
  if (byRow.error) return { data: [], error: new Error(byRow.error.message) };

  const byUser =
    linkedUserIds.length > 0
      ? await admin
          .from("creator_content")
          .select(select)
          .eq("brand_id", brandId)
          .in("creator_user_id", linkedUserIds)
          .order("created_at", { ascending: false })
      : { data: [] as Record<string, unknown>[], error: null };

  if (byUser.error?.message?.includes("creator_content")) {
    return { data: (byRow.data || []) as Record<string, unknown>[], error: null };
  }
  if (byUser.error) return { data: [], error: new Error(byUser.error.message) };

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(byRow.data || []), ...(byUser.data || [])]) {
    merged.set(String(row.id), row as Record<string, unknown>);
  }

  const data = [...merged.values()].sort((a, b) => {
    const aTime = new Date(String(a.created_at || 0)).getTime();
    const bTime = new Date(String(b.created_at || 0)).getTime();
    return bTime - aTime;
  });

  return { data, error: null };
}
