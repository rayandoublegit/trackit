// Outreach pipeline stages for the Creator Workspace (CRM board).
export type PipelineStage = "saved" | "contacted" | "in_progress" | "nurturing" | "signed" | "lost";

export interface StageDef {
  key: PipelineStage;
  label: string;
  color: string; // text color for badges/headers
  bg: string; // light background for badges/columns
}

const STAGE_META: Omit<StageDef, "label">[] = [
  { key: "saved", color: "#5F5E5A", bg: "#F1EFE8" },
  { key: "contacted", color: "#185FA5", bg: "#E6F1FB" },
  { key: "in_progress", color: "#854F0B", bg: "#FAEEDA" },
  { key: "nurturing", color: "#534AB7", bg: "#EEEDFE" },
  { key: "signed", color: "#3B6D11", bg: "#EAF3DE" },
  { key: "lost", color: "#A32D2D", bg: "#FCEBEB" },
];

const STAGE_LABELS: Record<"en" | "fr", Record<PipelineStage, string>> = {
  fr: {
    saved: "Sauvegardé",
    contacted: "Contacté",
    in_progress: "En cours",
    nurturing: "En éducation",
    signed: "Signé",
    lost: "Perdu",
  },
  en: {
    saved: "Saved",
    contacted: "Contacted",
    in_progress: "In progress",
    nurturing: "Nurturing",
    signed: "Signed",
    lost: "Lost",
  },
};

export function pipelineStages(lang: "en" | "fr" = "fr"): StageDef[] {
  return STAGE_META.map((s) => ({ ...s, label: STAGE_LABELS[lang][s.key] }));
}

/** @deprecated Prefer pipelineStages(lang) in UI code. */
export const PIPELINE_STAGES: StageDef[] = pipelineStages("fr");

export const STAGE_KEYS: PipelineStage[] = STAGE_META.map((s) => s.key);

const MAP_FR = new Map<string, StageDef>(pipelineStages("fr").map((s) => [s.key, s]));

export function stageLabel(key: string, lang: "en" | "fr" = "fr"): string {
  return STAGE_LABELS[lang][key as PipelineStage] ?? MAP_FR.get(key)?.label ?? key;
}

const META_MAP = new Map<string, Omit<StageDef, "label">>(STAGE_META.map((s) => [s.key, s]));

export function stageColor(key: string): { color: string; bg: string } {
  const s = META_MAP.get(key);
  return s ? { color: s.color, bg: s.bg } : { color: "#5F5E5A", bg: "#F1EFE8" };
}

export function isValidStage(key: string): key is PipelineStage {
  return META_MAP.has(key);
}
