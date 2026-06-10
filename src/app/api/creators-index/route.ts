import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  let body: { usernames?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ creators: {} }, { status: 400 });
  }

  const usernames = Array.isArray(body.usernames)
    ? body.usernames
        .map((u) => String(u).trim().replace(/^@/, ""))
        .filter(Boolean)
    : [];

  if (usernames.length === 0) {
    return NextResponse.json({ creators: {} });
  }

  const { data, error } = await supabaseAdmin
    .from("creators_index")
    .select(
      "username, display_name, avatar_url, followers, engagement_rate, avg_views, bio, platform, language, location, video_thumbnails, niches"
    )
    .in("username", usernames);

  if (error) {
    return NextResponse.json({ creators: {}, error: error.message }, { status: 500 });
  }

  const creators: Record<string, (typeof data)[number]> = {};
  for (const row of data ?? []) {
    if (row.username) creators[row.username] = row;
  }

  return NextResponse.json({ creators });
}
