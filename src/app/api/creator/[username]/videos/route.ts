import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import {
  getSupabaseAdminForVideos,
  resolveCreatorVideoStreams,
} from "@/lib/creator-video-resolve";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  // Signed-in only: a miss falls back to a paid provider call.
  if (!(await getAuthedUserId(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { username } = await params;
  if (!username?.trim()) {
    return NextResponse.json({ error: "missing username" }, { status: 400 });
  }

  const admin = getSupabaseAdminForVideos();
  if (!admin) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { videoIds?: string[] };
  const videoIds = Array.isArray(body.videoIds) ? body.videoIds : [];
  if (!videoIds.length) {
    return NextResponse.json({ streams: {} });
  }

  const streams = await resolveCreatorVideoStreams(admin, username.trim(), videoIds);
  return NextResponse.json({ streams });
}
