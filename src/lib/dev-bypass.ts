// LOCAL PREVIEW ONLY. When NEXT_PUBLIC_DEV_BYPASS_PLAN is set (in .env.local,
// which is gitignored and never present in Vercel/prod), the dashboard skips
// Supabase auth and renders as that plan — handy to preview gated features.
// Default empty string -> normal auth everywhere (prod included).
// Set e.g. NEXT_PUBLIC_DEV_BYPASS_PLAN=pro in .env.local, then restart dev.
export const DEV_BYPASS_PLAN = process.env.NEXT_PUBLIC_DEV_BYPASS_PLAN || "";
