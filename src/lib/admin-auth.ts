import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEV_BYPASS_PLAN, DEV_BYPASS_USER_ID } from "@/lib/dev-bypass";

/** True only in `next dev` with the local preview bypass on. */
export function adminDevPreview(): boolean {
  return process.env.NODE_ENV !== "production" && Boolean(DEV_BYPASS_PLAN);
}

// Liste des emails admin. On lit ADMIN_EMAILS (separes par virgule) si presente,
// sinon on retombe sur l'email proprietaire par defaut. La verite finale reste
// la colonne profiles.role: un email doit ETRE dans la liste OU avoir role admin/staff.
function allowedEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "hello@thentrack.it,theo.lcx.lecurieux@gmail.com,rayan.vincentsully@gmail.com,contact@kevinlerich.com,ngankoukitoko@gmail.com";
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

/** Who is asking: an admin, a signed-in account that is not staff, or nobody. */
export type AdminCheck =
  | { status: "admin"; admin: AdminContext }
  | { status: "denied"; email: string }
  | { status: "signed-out" }
  | { status: "unavailable" };

type CookieList = { name: string; value: string }[];

/**
 * Double controle: email dans la allowlist ENV ET/OU role admin|staff en base.
 * Shared by the API routes (request cookies) and the /admin layout (next/headers).
 */
export async function checkAdmin(cookieList: CookieList): Promise<AdminCheck> {
  // Local preview only (never in a production build): the console opens with sample data.
  if (adminDevPreview()) return { status: "admin", admin: { userId: DEV_BYPASS_USER_ID, email: "dev@localhost", role: "admin" } };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return { status: "unavailable" };

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieList;
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { status: "signed-out" };

  const email = user.email.toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) return { status: "unavailable" };

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
  if (!inAllowlist && !hasStaffRole) return { status: "denied", email };

  return { status: "admin", admin: { userId: user.id, email, role } };
}

/**
 * Verifie que la requete vient d'un admin connecte.
 * Retourne le contexte admin si autorise, sinon null.
 */
export async function requireAdmin(req: NextRequest): Promise<AdminContext | null> {
  const check = await checkAdmin(req.cookies.getAll());
  return check.status === "admin" ? check.admin : null;
}
