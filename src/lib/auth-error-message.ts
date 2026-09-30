import type { AppLang } from "@/lib/locale-preferences";
import { translateAuthError } from "@/lib/auth-errors";

// Supabase auth messages vary (punctuation, numbers, wording across versions),
// so French is matched by pattern rather than exact text.
const FR_PATTERNS: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/exceed_storage_size_quota|service for this project is restricted/, "Trackit est en maintenance pour le moment."],
  [/invalid (login )?credentials|invalid email or password/, "Email ou mot de passe incorrect."],
  [/email not confirmed/, "Email non confirmé. Vérifiez votre boîte de réception."],
  [/user already registered|already been registered|email address.*already|email_exists|user_already_exists/, "Un compte existe déjà avec cet email."],
  [/password should be at least (\d+)/, (m) => `Le mot de passe doit contenir au moins ${m[1]} caractères.`],
  [/password is known to be weak|weak password|weak_password|password.*(too weak|easy to guess)/, "Mot de passe trop faible. Choisissez-en un plus long et plus difficile à deviner."],
  [/password should contain/, "Le mot de passe doit mélanger lettres minuscules, majuscules, chiffres et symboles."],
  [/new password should be different/, "Le nouveau mot de passe doit être différent de l’ancien."],
  [/signup requires a valid password/, "Veuillez choisir un mot de passe valide."],
  [/unable to validate email address|invalid format|email address .* is invalid|invalid email/, "Adresse email invalide."],
  [/signups? not allowed|signup is disabled/, "Les inscriptions sont fermées pour le moment."],
  [/only request this (once )?(every|after) (\d+) seconds?/, (m) => `Pour des raisons de sécurité, patientez ${m[3]} secondes avant de réessayer.`],
  [/rate limit|too many requests|over_email_send_rate_limit|over_request_rate_limit/, "Trop de tentatives. Réessayez dans quelques minutes."],
  [/(token|link|otp).*(expired|invalid)|(expired|invalid).*(token|link|otp)/, "Ce lien a expiré ou n’est plus valide. Demandez-en un nouveau."],
  [/auth session missing|session.*(expired|not found)/, "Votre session a expiré. Reconnectez-vous."],
  [/user not found/, "Aucun compte trouvé avec cet email."],
  [/failed to fetch|network ?error|load failed/, "Connexion impossible. Vérifiez votre réseau et réessayez."],
];

/** User-facing auth error in the current language. English stays as Supabase words it. */
export function authErrorMessage(message: string | null | undefined, lang: AppLang): string {
  const raw = (message ?? "").trim();
  if (lang !== "fr") return translateAuthError(raw, "en");
  const key = raw.toLowerCase();
  for (const [pattern, fr] of FR_PATTERNS) {
    const m = key.match(pattern);
    if (m) return typeof fr === "string" ? fr : fr(m);
  }
  const translated = translateAuthError(raw, "fr");
  return translated && translated !== raw ? translated : "Une erreur est survenue. Réessayez.";
}
