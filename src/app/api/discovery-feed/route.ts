import { NextResponse } from "next/server";
import { buildFeed } from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const creators = await buildFeed();
    return NextResponse.json({ creators, count: creators.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "feed failed";
    return NextResponse.json({ creators: [], error: msg });
  }
}
