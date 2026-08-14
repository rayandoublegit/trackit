import { workspaceStorageKey } from "@/lib/workspaces";

export type PlannerNoteTime = "today" | "tomorrow" | "this_week" | "later";
export type PlannerNoteStatus = "incoming" | "ongoing" | "follow_up" | "done";
export type PlannerNoteKind = "meeting" | "follow_up" | "general";

export type PlannerNoteCreator = {
  handle: string;
  name: string;
  avatarUrl?: string;
};

export type PlannerMeetingNote = {
  id: string;
  title: string;
  description: string;
  time: PlannerNoteTime;
  status: PlannerNoteStatus;
  kind: PlannerNoteKind;
  creators: PlannerNoteCreator[];
  createdAt: number;
  updatedAt: number;
};

function storageKey(userId?: string) {
  return workspaceStorageKey(`trackit.planner.meeting-notes.${userId || "anon"}`);
}

function newId() {
  return `pn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createPlannerMeetingNote(
  partial?: Partial<Omit<PlannerMeetingNote, "id" | "createdAt" | "updatedAt">>,
): PlannerMeetingNote {
  const now = Date.now();
  return {
    id: newId(),
    title: partial?.title ?? "",
    description: partial?.description ?? "",
    time: partial?.time ?? "today",
    status: partial?.status ?? "incoming",
    kind: partial?.kind ?? "meeting",
    creators: partial?.creators ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function loadPlannerMeetingNotes(userId?: string): PlannerMeetingNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlannerMeetingNote[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlannerMeetingNotes(userId: string | undefined, notes: PlannerMeetingNote[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(notes));
  } catch {
    /* ignore */
  }
}
