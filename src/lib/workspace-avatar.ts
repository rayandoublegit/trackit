/** Account photo lives at `avatars/{ownerId}/avatar.*` and is saved via `/api/profile`. */
export function isAccountAvatarUrl(ownerId: string, url: string | null | undefined): boolean {
  if (!ownerId || !url) return false;
  const path = avatarStoragePath(url);
  if (!path) return false;
  return path.startsWith(`${ownerId}/avatar`) && !isWorkspaceMarkPath(path);
}

/** Workspace marks live at `avatars/workspace-marks/{workspaceId}/logo.*` via `/api/workspaces/:id/avatar`. */
export function workspaceMarkObjectPath(workspaceId: string, ext = "jpg"): string {
  return `workspace-marks/${workspaceId}/logo.${ext}`;
}

export function isWorkspaceMarkPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.startsWith("workspace-marks/") || path.includes("/workspaces/");
}

export function isWorkspaceAvatarUrl(
  _ownerId: string,
  workspaceId: string,
  url: string | null | undefined,
): boolean {
  if (!workspaceId || !url) return false;
  const path = avatarStoragePath(url);
  if (!path) return false;
  return (
    path.startsWith(`workspace-marks/${workspaceId}/`) ||
    path.includes(`/workspaces/${workspaceId}/`)
  );
}

export function avatarStoragePath(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  const marker = "/avatars/";
  const idx = trimmed.indexOf(marker);
  if (idx !== -1) {
    return decodeURIComponent(trimmed.slice(idx + marker.length).split("?")[0]);
  }
  return trimmed.split("?")[0] || null;
}

export function sameAvatarUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const pathA = avatarStoragePath(a);
  const pathB = avatarStoragePath(b);
  if (pathA && pathB) return pathA === pathB;
  return a.split("?")[0] === b.split("?")[0];
}

/** Drop inherited account photos so a workspace never displays the profile picture. */
export function workspaceAvatarOrNull(
  ownerId: string,
  workspaceId: string,
  workspaceAvatarUrl: string | null | undefined,
  accountAvatarUrl?: string | null,
): string | null {
  const url = workspaceAvatarUrl?.trim() || null;
  if (!url) return null;
  if (isAccountAvatarUrl(ownerId, url)) return null;
  if (accountAvatarUrl && sameAvatarUrl(url, accountAvatarUrl)) return null;
  const path = avatarStoragePath(url);
  if (isWorkspaceMarkPath(path)) return url;
  if (path?.startsWith(`${ownerId}/`)) return null;
  return url;
}

export async function uploadWorkspaceMark(
  workspaceId: string,
  file: File,
): Promise<{ ok: true; workspace: { id: string; avatar_url: string | null; name: string; owner_id: string } } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/workspaces/${workspaceId}/avatar`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    workspace?: { id: string; avatar_url: string | null; name: string; owner_id: string };
  };
  if (!res.ok || !data.ok || !data.workspace) {
    return { ok: false, error: data.error || "Couldn’t upload the picture." };
  }
  return { ok: true, workspace: data.workspace };
}
