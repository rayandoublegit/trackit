export const RAYAN_WORKSPACE_OWNER_EMAIL = "rayan@trackit";
export const HAYTAM_WORKSPACE_ADMIN_EMAIL = "haytam@trackit";

export function normalizeWorkspaceEmail(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}
