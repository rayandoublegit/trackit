export type BrandWorkspace = {
  id: string;
  owner_id: string;
  name: string;
  avatar_url: string | null;
  created_at?: string;
};

const ACTIVE_WORKSPACE_KEY = "trackit_active_workspace_id";
const IDENTITY_KEY = "trackit_workspace_identity_v1";

export function readActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveWorkspaceId(workspaceId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  } catch {
    /* ignore */
  }
}

/** Active brand-space id from client identity / localStorage. */
export function getClientBrandWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || "null") as {
      workspaceId?: string;
      ownerId?: string;
    } | null;
    if (parsed?.workspaceId) return parsed.workspaceId;
  } catch {
    /* ignore */
  }
  return readActiveWorkspaceId();
}

export function workspaceStorageKey(base: string, workspaceId?: string | null) {
  const id = workspaceId ?? getClientBrandWorkspaceId();
  return id ? `${base}.${id}` : base;
}
