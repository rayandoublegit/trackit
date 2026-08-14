import {
  getClientBrandWorkspaceId,
  readActiveWorkspaceId,
  writeActiveWorkspaceId,
} from "@/lib/workspaces";

export const BRAND_WORKSPACE_HEADER = "x-trackit-workspace-id";

/** Client helper: owner account id + active space id. */
export function clientBrandScope(ownerId: string): { ownerId: string; spaceId: string } {
  const spaceId = getClientBrandWorkspaceId() || readActiveWorkspaceId() || ownerId;
  return { ownerId, spaceId };
}

export function rememberClientBrandSpace(spaceId: string) {
  writeActiveWorkspaceId(spaceId);
}

/** Inject X-Trackit-Workspace-Id on same-origin /api fetches. */
export function installWorkspaceFetchHeader() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __trackitWsFetch?: boolean };
  if (w.__trackitWsFetch) return;
  w.__trackitWsFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const isApi =
        url.startsWith("/api/") ||
        url.includes("/api/") ||
        (url.startsWith("http") && url.includes("/api/"));
      const spaceId = getClientBrandWorkspaceId() || readActiveWorkspaceId();
      if (isApi && spaceId) {
        const headers = new Headers(init?.headers);
        if (!headers.has(BRAND_WORKSPACE_HEADER)) {
          headers.set(BRAND_WORKSPACE_HEADER, spaceId);
        }
        return original(input, { ...init, headers });
      }
    } catch {
      /* fall through */
    }
    return original(input, init);
  };
}
