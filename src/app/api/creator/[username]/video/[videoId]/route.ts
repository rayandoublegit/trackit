import { NextResponse } from "next/server";
import {
  getSupabaseAdminForVideos,
  resolveCreatorVideoStreams,
} from "@/lib/creator-video-resolve";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string; videoId: string }> }
) {
  const { username, videoId } = await params;
  if (!username?.trim() || !videoId?.trim()) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const admin = getSupabaseAdminForVideos();
  if (!admin) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const streams = await resolveCreatorVideoStreams(admin, username.trim(), [videoId.trim()]);
  const url = streams[videoId.trim()];
  if (!url) {
    return NextResponse.json({ error: "video unavailable" }, { status: 404 });
  }

  return NextResponse.json(
    { url },
    { headers: { "cache-control": "private, max-age=3600" } }
  );
}
