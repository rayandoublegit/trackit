import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { BRAND_WORKSPACE_HEADER } from "@/lib/brand-workspace";

type RequestLike = NextRequest | Request;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Resolve the active brand-space id for an owner account. */
export async function resolveBrandSpaceId(
  request: RequestLike | undefined,
  ownerId: string,
): Promise<string> {
  const header = request?.headers?.get(BRAND_WORKSPACE_HEADER)?.trim() || "";
  const admin = adminClient();

  if (header && admin) {
    const { data } = await admin
      .from("workspaces")
      .select("id")
      .eq("id", header)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (admin) {
    const { data: profile } = await admin
      .from("profiles")
      .select("active_workspace_id")
      .eq("id", ownerId)
      .maybeSingle();
    if (profile?.active_workspace_id) {
      const { data: ws } = await admin
        .from("workspaces")
        .select("id")
        .eq("id", profile.active_workspace_id)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (ws?.id) return ws.id;
    }
  }

  return ownerId;
}

export async function requireBrandSpace(
  request: RequestLike | undefined,
): Promise<{ ownerId: string; spaceId: string } | { error: NextResponse }> {
  const ownerId = await getAuthedUserId(request);
  if (!ownerId) {
    return { error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const spaceId = await resolveBrandSpaceId(request, ownerId);
  return { ownerId, spaceId };
}
