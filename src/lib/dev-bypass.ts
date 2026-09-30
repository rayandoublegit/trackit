// LOCAL PREVIEW ONLY. When NEXT_PUBLIC_DEV_BYPASS_PLAN is set (in .env.local,
// which is gitignored and never present in Vercel/prod), the dashboard skips
// Supabase auth and renders as that plan — handy to preview gated features.
// Default empty string -> normal auth everywhere (prod included).
// Set e.g. NEXT_PUBLIC_DEV_BYPASS_PLAN=pro in .env.local, then restart dev.
// Never active in a production build, even if the variable is set on the host.
export const DEV_BYPASS_PLAN = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_DEV_BYPASS_PLAN || "" : "";

// The user id used by API routes when the bypass is on. Set
// NEXT_PUBLIC_DEV_BYPASS_USER_ID to a real auth.users id in .env.local to make
// saved/folders/pipeline rows persist (they FK to auth.users).
export const DEV_BYPASS_USER_ID =
  process.env.NEXT_PUBLIC_DEV_BYPASS_USER_ID || "00000000-0000-0000-0000-000000000000";
