const EDIT_KEY = "trackit.workspace.editId";
export const WORKSPACE_EDIT_EVENT = "trackit:workspace-edit";

export function setWorkspaceEditId(workspaceId: string, opts?: { silent?: boolean }) {
  if (typeof window === "undefined") return;
  try {
    const prev = sessionStorage.getItem(EDIT_KEY);
    sessionStorage.setItem(EDIT_KEY, workspaceId);
    if (!opts?.silent && prev !== workspaceId) {
      window.dispatchEvent(new CustomEvent(WORKSPACE_EDIT_EVENT, { detail: { workspaceId } }));
    }
  } catch {
    /* ignore */
  }
}

export function getWorkspaceEditId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(EDIT_KEY);
  } catch {
    return null;
  }
}
