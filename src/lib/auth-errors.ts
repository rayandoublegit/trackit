import type { Lang } from "@/lib/useLang";

const AUTH_ERROR_FR: Record<string, string> = {
  "invalid login credentials": "Identifiants de connexion invalides.",
  "email not confirmed": "Email non confirmé. Vérifiez votre boîte de réception.",
  "user already registered": "Un compte existe déjà avec cet email.",
  "password should be at least 6 characters": "Le mot de passe doit contenir au moins 6 caractères.",
  "signup requires a valid password": "Veuillez choisir un mot de passe valide.",
  "unable to validate email address: invalid format": "Adresse email invalide.",
  "email rate limit exceeded": "Trop de tentatives. Réessayez dans quelques minutes.",
  "for security purposes, you can only request this once every 60 seconds":
    "Pour des raisons de sécurité, veuillez patienter 60 secondes avant de réessayer.",
};

export function translateAuthError(message: string, lang: Lang): string {
  const key = message.trim().toLowerCase();
  if (
    key.includes("exceed_storage_size_quota") ||
    key.includes("service for this project is restricted")
  ) {
    return "Trackit est actuellement en maintenance.";
  }
  if (lang !== "fr") return message;
  return AUTH_ERROR_FR[key] ?? message;
}
