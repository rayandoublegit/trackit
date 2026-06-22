// Local dev-only auth + plan bypass, for previewing the dashboard without a
// real Supabase session / Stripe subscription.
//
// SAFETY: this is physically OFF in production. `next build` / `next start`
// (and Vercel) set NODE_ENV="production", so DEV_BYPASS_AUTH is always `false`
// there regardless of the public flag. It only ever activates under `next dev`
// AND when NEXT_PUBLIC_DEV_BYPASS_AUTH=true is set in .env.local (gitignored).
//
// To enable:   add `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` to .env.local, restart dev.
// To disable:  remove that line (or set it to false), restart dev.
export const DEV_BYPASS_AUTH =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

// Fake premium identity used while the bypass is active.
export const DEV_BYPASS_USER_ID = "00000000-0000-0000-0000-000000000000";
export const DEV_BYPASS_PLAN = "pro";
