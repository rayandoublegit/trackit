import { NextResponse, type NextRequest } from "next/server";
import { getAuthedActorId } from "@/lib/api-auth";
import { requireBrandSpace } from "@/lib/brand-workspace-server";
import { GIFT_PRODUCT_BUCKET, GIFT_PRODUCT_IMAGE_MAX_BYTES, sniffGiftImage } from "@/lib/gift-share";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Product photo of a gift campaign (brand only). Stored in the public
// gift-products bucket under the brand's id; the campaign may only reference
// URLs from that folder (see parseGiftCampaignInput).

export async function POST(request: NextRequest) {
  const actorId = await getAuthedActorId(request);
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { data: profile } = await admin.from("profiles").select("account_type").eq("id", actorId).maybeSingle();
  if ((profile as { account_type?: string } | null)?.account_type === "creator") {
    return NextResponse.json({ error: "Brands only." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size < 1) return NextResponse.json({ error: "Image required." }, { status: 400 });
  if (file.size > GIFT_PRODUCT_IMAGE_MAX_BYTES) return NextResponse.json({ error: "Image too large." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffGiftImage(bytes);
  if (!type) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 400 });

  const path = `${access.ownerId}/${crypto.randomUUID()}.${type.ext}`;
  const uploaded = await admin.storage.from(GIFT_PRODUCT_BUCKET).upload(path, bytes, {
    contentType: type.mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploaded.error) return NextResponse.json({ error: uploaded.error.message }, { status: 500 });
  const { data } = admin.storage.from(GIFT_PRODUCT_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return NextResponse.json({ error: "Could not build image URL." }, { status: 500 });
  return NextResponse.json({ url: data.publicUrl });
}
