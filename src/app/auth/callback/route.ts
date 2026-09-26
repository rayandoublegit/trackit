import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { selectProfileRow } from "@/lib/profile-row";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const creatorOnly = searchParams.get("role") === "creator";
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const profile = await selectProfileRow<{
          onboarding_completed?: boolean | null;
          account_type?: string | null;
        }>(supabase, user.id, ["onboarding_completed", "account_type"]);
        if (creatorOnly) {
          if (profile?.account_type === "creator") {
            return NextResponse.redirect(`${origin}/dashboard?view=analytics`);
          }
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/auth?mode=login&role=creator&error=not_creator`);
        }
        if (profile && profile.account_type === "creator") {
          return NextResponse.redirect(`${origin}/dashboard?view=analytics`);
        }
        const finished =
          profile?.onboarding_completed === true || user.user_metadata?.onboarding_completed === true;
        if (!finished) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
        return NextResponse.redirect(`${origin}/dashboard`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth`);
}
