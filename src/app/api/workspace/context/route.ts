import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await resolveWorkspaceContextForUser(user);
    return NextResponse.json({ ok: true, ...context });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        error: error instanceof Error ? error.message : "Workspace unavailable",
      },
      { status: 409 },
    );
  }
}
