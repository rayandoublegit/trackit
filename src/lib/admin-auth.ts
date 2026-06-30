import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Liste des emails admin. On lit ADMIN_EMAILS (separes par virgule) si presente,
// sinon on retombe sur l'email proprietaire par defaut. La verite finale reste
// la colonne profiles.role: un email doit ETRE dans la liste OU avoir role admin/staff.
function allowedEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "hello@thentrack.it";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type AdminContext = {
  userId: string;
  email: string;
  role: string;
};

/**
 * Verifie que la requete vient d'un admin connecte.
 * Double controle: email dans la allowlist ENV ET/OU role admin|staff en base.
 * Retourne le contexte admin si autorise, sinon null.
 */
export async function requireAdmin(req: NextRequest): Promise<AdminContext | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? "user").toLowerCase();
  const inAllowlist = allowedEmails().includes(email);
  const hasStaffRole = role === "admin" || role === "staff";

  // Il faut au moins une des deux conditions. En pratique on veut les deux
  // alignees, mais accepter l'une OU l'autre evite de te verrouiller dehors
  // si l'ENV n'est pas encore poussee sur Vercel.
  if (!inAllowlist && !hasStaffRole) return null;

  return { userId: user.id, email, role };
}
