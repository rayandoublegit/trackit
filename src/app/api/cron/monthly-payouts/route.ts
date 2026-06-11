import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// SAFETY: the previous implementation of this cron reset creator balances
// WITHOUT sending any real money (no Stripe transfer was ever made).
// It is disabled until real Stripe transfers are implemented.
// The old implementation is preserved in git history (see commit 464f0c2 and earlier).

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    paid: 0,
    disabled: true,
    reason: "auto payouts disabled until Stripe transfers are wired",
  });
}
