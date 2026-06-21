export type CampaignStatusLabel = "Active" | "Paused" | "Completed" | "Draft";

export function normalizeCampaignStatus(status: string): CampaignStatusLabel {
  const s = (status || "").toLowerCase();
  if (s === "active") return "Active";
  if (s === "paused") return "Paused";
  if (s === "completed") return "Completed";
  return "Draft";
}

export function campaignStatusLabel(status: string, lang: "en" | "fr"): string {
  const normalized = normalizeCampaignStatus(status);
  const labels: Record<CampaignStatusLabel, { en: string; fr: string }> = {
    Active: { en: "Active", fr: "Actif" },
    Paused: { en: "Paused", fr: "En pause" },
    Completed: { en: "Completed", fr: "Terminé" },
    Draft: { en: "Draft", fr: "Brouillon" },
  };
  return labels[normalized][lang];
}

function campaignRowFingerprint(row: Record<string, unknown>): string {
  const name = String(row.name ?? "").trim().toLowerCase();
  const platform = String(row.platform ?? "").trim().toLowerCase();
  const minute = row.created_at ? String(row.created_at).slice(0, 16) : "";
  return `${name}|${platform}|${minute}`;
}

export function dedupeCampaignRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  return rows.filter((row) => {
    const id = String(row.id ?? "");
    if (id) {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
    }
    const fingerprint = campaignRowFingerprint(row);
    if (seenFingerprints.has(fingerprint)) return false;
    seenFingerprints.add(fingerprint);
    return true;
  });
}
