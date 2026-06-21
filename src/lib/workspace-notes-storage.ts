const STORAGE_PREFIX = "trackit_workspace_notes_";
const LEGACY_PREFIX = "trackit_workspace_notes_";

export type WorkspaceNoteColor = "yellow" | "blue" | "green" | "pink" | "purple";

export type WorkspaceNote = {
  id: string;
  title: string;
  content: string;
  color: WorkspaceNoteColor;
  updatedAt: number;
};

export const NOTE_COLORS: Record<
  WorkspaceNoteColor,
  { bg: string; header: string; shadow: string }
> = {
  yellow: { bg: "#FFF9B1", header: "#F5E875", shadow: "rgba(180, 160, 40, 0.25)" },
  blue: { bg: "#B8D4F0", header: "#9BC0E8", shadow: "rgba(60, 100, 160, 0.22)" },
  green: { bg: "#C8E6C9", header: "#A5D6A7", shadow: "rgba(60, 120, 70, 0.22)" },
  pink: { bg: "#F8BBD0", header: "#F48FB1", shadow: "rgba(180, 80, 110, 0.22)" },
  purple: { bg: "#E1BEE7", header: "#CE93D8", shadow: "rgba(120, 70, 140, 0.22)" },
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}v2_${userId}`;
}

function newNoteId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createWorkspaceNote(
  partial?: Partial<Pick<WorkspaceNote, "title" | "content" | "color">>,
): WorkspaceNote {
  return {
    id: newNoteId(),
    title: partial?.title ?? "",
    content: partial?.content ?? "",
    color: partial?.color ?? "yellow",
    updatedAt: Date.now(),
  };
}

function migrateLegacyNotes(userId: string): WorkspaceNote[] | null {
  if (typeof window === "undefined") return null;
  try {
    const legacy = localStorage.getItem(`${LEGACY_PREFIX}${userId}`);
    if (!legacy?.trim()) return null;
    return [
      createWorkspaceNote({
        title: "",
        content: legacy,
        color: "yellow",
      }),
    ];
  } catch {
    return null;
  }
}

export function loadWorkspaceNotes(userId: string): WorkspaceNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceNote[];
      if (Array.isArray(parsed)) return parsed;
    }
    const migrated = migrateLegacyNotes(userId);
    if (migrated) {
      saveWorkspaceNotes(userId, migrated);
      return migrated;
    }
    return [createWorkspaceNote({ color: "yellow" })];
  } catch {
    return [createWorkspaceNote({ color: "yellow" })];
  }
}

export function saveWorkspaceNotes(userId: string, notes: WorkspaceNote[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(notes));
    localStorage.removeItem(`${LEGACY_PREFIX}${userId}`);
  } catch {
    /* storage unavailable */
  }
}

const PANEL_OPEN_KEY = "trackit_notes_panel_open";

export function loadNotesPanelOpen(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(`${PANEL_OPEN_KEY}_${userId}`);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function saveNotesPanelOpen(userId: string, open: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${PANEL_OPEN_KEY}_${userId}`, open ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}
