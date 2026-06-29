import type { Lang } from "@/lib/useLang";

export const PROFILE_USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export type ProfileUsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function normalizeProfileUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");
}

export function isValidProfileUsername(username: string): boolean {
  return PROFILE_USERNAME_PATTERN.test(username);
}

export function profileUsernameTakenMessage(lang: Lang): string {
  return lang === "fr" ? "Ce nom d'utilisateur est déjà pris." : "This username is already taken.";
}

export function profileUsernameInvalidMessage(lang: Lang): string {
  return lang === "fr"
    ? "3–20 caractères, lettres, chiffres et underscores uniquement."
    : "3–20 characters, letters, numbers, and underscores only.";
}

export function profileUsernameStatusMessage(status: ProfileUsernameStatus, lang: Lang): string {
  if (status === "checking") return lang === "fr" ? "Vérification..." : "Checking...";
  if (status === "available") return lang === "fr" ? "✓ Disponible" : "✓ Available";
  if (status === "taken") return profileUsernameTakenMessage(lang);
  if (status === "invalid") return profileUsernameInvalidMessage(lang);
  return "";
}

export function profileUsernameStatusColor(status: ProfileUsernameStatus): string {
  if (status === "available") return "#1FB567";
  if (status === "taken" || status === "invalid") return "#DC2626";
  return "rgba(0,0,0,0.4)";
}

export function isProfileUsernameConflictError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique") || msg.includes("profiles_username");
}

export function profileUsernameSaveError(
  error: { code?: string; message?: string } | null | undefined,
  lang: Lang,
): string {
  if (isProfileUsernameConflictError(error)) return profileUsernameTakenMessage(lang);
  return error?.message ?? (lang === "fr" ? "Impossible d'enregistrer le profil." : "Could not save profile.");
}

export async function fetchProfileUsernameAvailability(
  username: string,
): Promise<Exclude<ProfileUsernameStatus, "idle" | "checking">> {
  const normalized = normalizeProfileUsername(username);
  if (!normalized || !isValidProfileUsername(normalized)) return "invalid";

  const res = await fetch(`/api/profile/username/check?username=${encodeURIComponent(normalized)}`, {
    credentials: "include",
  });
  if (!res.ok) return "taken";

  const data = (await res.json().catch(() => ({}))) as { available?: boolean };
  return data.available ? "available" : "taken";
}
