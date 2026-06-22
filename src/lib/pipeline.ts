// Outreach pipeline stages for the Creator Workspace (CRM board).
export type PipelineStage = "saved" | "contacted" | "in_progress" | "nurturing" | "signed" | "lost";

export interface StageDef {
  key: PipelineStage;
  label: string;
  color: string; // text color for badges/headers
  bg: string; // light background for badges/columns
}

export const PIPELINE_STAGES: StageDef[] = [
  { key: "saved", label: "Sauvegardé", color: "#5F5E5A", bg: "#F1EFE8" },
  { key: "contacted", label: "Contacté", color: "#185FA5", bg: "#E6F1FB" },
  { key: "in_progress", label: "En cours", color: "#854F0B", bg: "#FAEEDA" },
  { key: "nurturing", label: "En éducation", color: "#534AB7", bg: "#EEEDFE" },
  { key: "signed", label: "Signé", color: "#3B6D11", bg: "#EAF3DE" },
  { key: "lost", label: "Perdu", color: "#A32D2D", bg: "#FCEBEB" },
];

export const STAGE_KEYS: PipelineStage[] = PIPELINE_STAGES.map((s) => s.key);

const MAP = new Map<string, StageDef>(PIPELINE_STAGES.map((s) => [s.key, s]));

export function stageLabel(key: string): string {
  return MAP.get(key)?.label ?? key;
}

export function stageColor(key: string): { color: string; bg: string } {
  const s = MAP.get(key);
  return s ? { color: s.color, bg: s.bg } : { color: "#5F5E5A", bg: "#F1EFE8" };
}

export function isValidStage(key: string): key is PipelineStage {
  return MAP.has(key);
}
