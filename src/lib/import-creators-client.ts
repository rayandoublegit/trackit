import type { FeedCreator } from "@/lib/discovery-feed";
import type { ParsedCreatorImportRow } from "@/lib/parse-creator-import";
import { addToFolder, saveCreator, setNotes, setStage } from "@/lib/workspace-client";

function rowToFeedCreator(row: ParsedCreatorImportRow): FeedCreator {
  return {
    username: row.username,
    displayName: row.displayName,
    avatarUrl: "",
    followersCount: row.followers,
    engagementRate: row.engagementRate,
    avgViews: 0,
    primaryNiche: "",
    niche: "",
    countryCode: null,
    valueScore: 0,
    estCpm: 0,
    estCostPerPost: 0,
    valueTier: "micro",
    engagementByFollower: 0,
    postFrequency: 0,
    lastPostAt: null,
    authenticityScore: 0,
    qualityStatus: "ok",
    platform: row.platform,
    bio: "",
    email: row.email,
    language: "unknown",
    location: null,
    videoThumbnails: [],
  } as unknown as FeedCreator;
}

export type ImportCreatorsResult = {
  imported: number;
  skipped: number;
  addedToList: number;
  errors: string[];
};

export async function importCreatorRows(
  rows: ParsedCreatorImportRow[],
  options?: { folderId?: string | null }
): Promise<ImportCreatorsResult> {
  const result: ImportCreatorsResult = { imported: 0, skipped: 0, addedToList: 0, errors: [] };

  for (const row of rows) {
    try {
      const creator = rowToFeedCreator(row);
      const saved = await saveCreator(creator, row.status);
      if (saved.status === 402) {
        result.errors.push(`limit:${row.username}`);
        result.skipped += 1;
        break;
      }
      if (!saved.ok) {
        result.skipped += 1;
        if (saved.error) result.errors.push(`${row.username}: ${saved.error}`);
        continue;
      }

      if (row.status && row.status !== "saved") {
        await setStage(row.username, row.status);
      }
      if (row.notes) {
        await setNotes(row.username, row.notes);
      }
      if (options?.folderId) {
        await addToFolder(options.folderId, row.username);
        result.addedToList += 1;
      }

      result.imported += 1;
    } catch {
      result.skipped += 1;
      result.errors.push(row.username);
    }
  }

  return result;
}
