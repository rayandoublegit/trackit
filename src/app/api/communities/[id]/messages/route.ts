import { NextRequest, NextResponse } from "next/server";
import { getAuthedActorId, getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function assertMemberAccess(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  request: NextRequest,
  communityId: string,
  actorId: string,
) {
  const { data: community } = await admin
    .from("communities")
    .select("id, brand_id, members_can_post")
    .eq("id", communityId)
    .maybeSingle();
  if (!community) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const ownerId = await getAuthedUserId(request);
  const isBrandOwner = ownerId === community.brand_id;

  const { data: membership } = await admin
    .from("community_members")
    .select("role, can_post")
    .eq("community_id", communityId)
    .eq("user_id", actorId)
    .maybeSingle();

  if (!membership && !isBrandOwner) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const role = membership?.role || (isBrandOwner ? "owner" : "member");
  const canPost =
    isBrandOwner ||
    role === "owner" ||
    role === "admin" ||
    (Boolean(membership?.can_post) && community.members_can_post !== false);

  return {
    community,
    membership: membership || (isBrandOwner ? { role: "owner", can_post: true } : null),
    canPost,
    isBrandOwner,
  };
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const actorId = await getAuthedActorId(request);
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertMemberAccess(admin, request, id, actorId);
  if ("error" in access && access.error instanceof NextResponse) return access.error;

  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 50)));
  const before = new URL(request.url).searchParams.get("before");

  let query = admin
    .from("community_messages")
    .select("id, community_id, author_id, body, image_url, reply_to_id, mentions, created_at")
    .eq("community_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [...(data || [])].reverse();
  const replyIds = rows.map((r) => r.reply_to_id).filter(Boolean) as string[];
  const { data: replies } = replyIds.length
    ? await admin.from("community_messages").select("id, body, author_id, image_url").in("id", replyIds)
    : { data: [] as { id: string; body: string | null; author_id: string; image_url: string | null }[] };
  const replyBy = new Map((replies || []).map((r) => [r.id, r]));

  const authorIds = [
    ...new Set([...rows.map((r) => r.author_id), ...(replies || []).map((r) => r.author_id)]),
  ];
  const { data: profiles } = authorIds.length
    ? await admin.from("profiles").select("id, full_name, username, avatar_url, business_name").in("id", authorIds)
    : {
        data: [] as {
          id: string;
          full_name: string | null;
          username: string | null;
          avatar_url: string | null;
          business_name: string | null;
        }[],
      };
  const profileBy = new Map((profiles || []).map((p) => [p.id, p]));

  const profileLabel = (p: {
    business_name: string | null;
    full_name: string | null;
    username: string | null;
  } | null | undefined) => p?.business_name || p?.full_name || (p?.username ? `@${p.username}` : "User");

  return NextResponse.json({
    ok: true,
    canPost: access.canPost,
    messages: rows.map((m) => {
      const author = profileBy.get(m.author_id);
      const reply = m.reply_to_id ? replyBy.get(m.reply_to_id) : null;
      const replyAuthor = reply ? profileBy.get(reply.author_id) : null;
      return {
        id: m.id,
        body: m.body,
        imageUrl: m.image_url,
        replyToId: m.reply_to_id,
        mentions: m.mentions || [],
        createdAt: m.created_at,
        authorId: m.author_id,
        authorName: profileLabel(author),
        authorAvatar: author?.avatar_url || null,
        replyPreview: reply
          ? {
              id: reply.id,
              body: reply.body,
              authorId: reply.author_id,
              authorName: profileLabel(replyAuthor),
              imageUrl: reply.image_url,
            }
          : null,
      };
    }),
  });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const actorId = await getAuthedActorId(request);
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertMemberAccess(admin, request, id, actorId);
  if ("error" in access && access.error instanceof NextResponse) return access.error;
  if (!access.canPost) {
    return NextResponse.json({ error: "You cannot post in this community" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  const replyToId = typeof body?.replyToId === "string" ? body.replyToId.trim() : "";
  const mentions = Array.isArray(body?.mentions)
    ? [...new Set(body.mentions.map((m: unknown) => String(m || "").trim()).filter(Boolean))]
    : [];

  if (!text && !imageUrl) {
    return NextResponse.json({ error: "Message or image required" }, { status: 400 });
  }

  if (replyToId) {
    const { data: parent } = await admin
      .from("community_messages")
      .select("id")
      .eq("id", replyToId)
      .eq("community_id", id)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: "Reply target not found" }, { status: 400 });
  }

  if (access.isBrandOwner) {
    await admin.from("community_members").upsert(
      {
        community_id: id,
        user_id: access.community.brand_id,
        role: "owner",
        can_post: true,
      },
      { onConflict: "community_id,user_id" },
    );
    if (actorId !== access.community.brand_id) {
      await admin.from("community_members").upsert(
        {
          community_id: id,
          user_id: actorId,
          role: "admin",
          can_post: true,
        },
        { onConflict: "community_id,user_id" },
      );
    }
  }

  const { data, error } = await admin
    .from("community_messages")
    .insert({
      community_id: id,
      author_id: actorId,
      body: text || null,
      image_url: imageUrl || null,
      reply_to_id: replyToId || null,
      mentions,
    })
    .select("id, community_id, author_id, body, image_url, reply_to_id, mentions, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: author } = await admin
    .from("profiles")
    .select("id, full_name, username, avatar_url, business_name")
    .eq("id", actorId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    message: {
      id: data.id,
      body: data.body,
      imageUrl: data.image_url,
      replyToId: data.reply_to_id,
      mentions: data.mentions || [],
      createdAt: data.created_at,
      authorId: data.author_id,
      authorName:
        author?.business_name ||
        author?.full_name ||
        (author?.username ? `@${author.username}` : "User"),
      authorAvatar: author?.avatar_url || null,
      replyPreview: null,
    },
  });
}
