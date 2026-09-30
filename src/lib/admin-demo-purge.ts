import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEMO_CAMPAIGN_MARKER,
  DEMO_CAMPAIGN_NAME,
  DEMO_CREATOR_NOTES,
  DEMO_CREATOR_POOL,
  DEMO_LIST_NAME,
  demoAvatarUrl,
} from "@/lib/demo-preset-data";
import { isMissingRelation } from "@/lib/admin-data";

// Removes what the old "Trackit" demo preset wrote into real tables for every
// brand: a fake campaign, 8 fake creators, fake paid sales, fake content and a
// "Trackit" list. Only rows carrying the preset's markers are touched.

const LEGACY_DEMO_CREATOR_NOTES = "Créateur démo Trackit";
const DEMO_CONTENT_NOTES = "Trackit demo content";
const CHUNK = 200;

export type PurgeTable =
  | "sales"
  | "campaign_content"
  | "campaign_creators"
  | "affiliate_links"
  | "creator_content"
  | "discovery_saved"
  | "discovery_folder_items"
  | "discovery_folders"
  | "campaigns"
  | "creators";

export type PurgeReport = { dryRun: boolean; counts: Record<PurgeTable, number>; errors: string[] };

type Db = SupabaseClient;
// PostgREST builders are deeply generic; filters are written against the loose shape.
type Filter = (query: any) => any;

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/** Ids of the rows matching `filter`, read page by page. */
async function ids(db: Db, table: string, filter: Filter): Promise<{ ids: string[]; error: string | null }> {
  const out: string[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await filter(db.from(table).select("id")).range(from, from + 999);
    if (error) return { ids: out, error: isMissingRelation(error) ? null : `${table}: ${error.message}` };
    const batch = (data ?? []) as { id: unknown }[];
    for (const r of batch) if (r.id != null) out.push(String(r.id));
    if (batch.length < 1000) break;
  }
  return { ids: [...new Set(out)], error: null };
}

/** A set of rows to delete, described by filters (some tables have no id column). */
type Target = { table: PurgeTable; filters: Filter[] };

async function countTarget(db: Db, t: Target): Promise<{ count: number; error: string | null }> {
  let total = 0;
  for (const f of t.filters) {
    const { count, error } = await f(db.from(t.table).select("*", { count: "exact", head: true }));
    if (error) {
      if (isMissingRelation(error)) continue;
      return { count: total, error: `${t.table}: ${error.message}` };
    }
    total += count ?? 0;
  }
  return { count: total, error: null };
}

async function deleteTarget(db: Db, t: Target): Promise<string | null> {
  for (const f of t.filters) {
    const { error } = await f(db.from(t.table).delete());
    if (error && !isMissingRelation(error)) return `${t.table}: ${error.message}`;
  }
  return null;
}

const inChunks = (column: string, list: string[]): Filter[] => chunks(list).map((part) => (q) => q.in(column, part));

export async function purgeDemoData(db: Db, dryRun: boolean): Promise<PurgeReport> {
  const errors: string[] = [];
  const keep = (r: { ids: string[]; error: string | null }) => {
    if (r.error) errors.push(r.error);
    return r.ids;
  };

  const handles = DEMO_CREATOR_POOL.map((c) => c.handle);
  const avatars = DEMO_CREATOR_POOL.map((c) => demoAvatarUrl(c.avatarSeed));

  const campaigns = keep(
    await ids(db, "campaigns", (q) => q.eq("name", DEMO_CAMPAIGN_NAME).ilike("description", `%${DEMO_CAMPAIGN_MARKER}%`)),
  );
  const creators = keep(await ids(db, "creators", (q) => q.in("handle", handles).in("avatar_url", avatars)));
  const folders = keep(await ids(db, "discovery_folders", (q) => q.eq("name", DEMO_LIST_NAME)));

  // A "Trackit" list is removed only when nothing but demo handles is in it.
  const demoHandles = new Set(handles.map((h) => h.toLowerCase()));
  const foldersLeftEmpty: string[] = [];
  for (const folderId of folders) {
    const { data, error } = await db.from("discovery_folder_items").select("creator_username").eq("folder_id", folderId);
    if (error) {
      if (!isMissingRelation(error)) errors.push(`discovery_folder_items: ${error.message}`);
      continue;
    }
    const rows = (data ?? []) as { creator_username: string | null }[];
    if (rows.every((r) => demoHandles.has(String(r.creator_username ?? "").toLowerCase()))) foldersLeftEmpty.push(folderId);
  }

  // Children first, so foreign keys never block the parents.
  const targets: Target[] = [
    {
      table: "sales",
      filters: [(q) => q.like("shopify_order_id", "demo\\_%"), (q) => q.like("shopify_order_id", "manual\\_demo\\_%"), ...inChunks("campaign_id", campaigns)],
    },
    { table: "campaign_content", filters: inChunks("campaign_id", campaigns) },
    { table: "campaign_creators", filters: inChunks("campaign_id", campaigns) },
    { table: "affiliate_links", filters: inChunks("campaign_id", campaigns) },
    { table: "creator_content", filters: [(q) => q.like("notes", `${DEMO_CONTENT_NOTES}%`)] },
    {
      table: "discovery_saved",
      filters: [
        (q) => q.eq("notes", DEMO_CREATOR_NOTES),
        (q) => q.eq("notes", LEGACY_DEMO_CREATOR_NOTES),
        (q) => q.eq("snapshot->crm->>label", "Demo Trackit"),
      ],
    },
    { table: "discovery_folder_items", filters: chunks(folders).map((part) => (q) => q.in("folder_id", part).in("creator_username", handles)) },
    { table: "discovery_folders", filters: inChunks("id", foldersLeftEmpty) },
    { table: "campaigns", filters: inChunks("id", campaigns) },
    { table: "creators", filters: inChunks("id", creators) },
  ];

  const counts = {} as Record<PurgeTable, number>;
  for (const t of targets) {
    const c = await countTarget(db, t);
    counts[t.table] = c.count;
    if (c.error) errors.push(c.error);
  }
  if (dryRun) return { dryRun, counts, errors };

  for (const t of targets) {
    const error = await deleteTarget(db, t);
    if (error) errors.push(error);
  }
  return { dryRun, counts, errors };
}
