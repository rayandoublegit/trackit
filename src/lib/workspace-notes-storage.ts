const STORAGE_PREFIX = "trackit_workspace_notes_";

export function loadWorkspaceNotes(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export function saveWorkspaceNotes(userId: string, content: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, content);
  } catch {
    /* storage unavailable */
  }
}
