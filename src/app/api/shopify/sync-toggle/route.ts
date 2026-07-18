import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireWorkspaceAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Active ou desactive la synchronisation automatique (webhook Shopify orders/create).
// POST { userId, enabled: boolean }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const access = await requireWorkspaceAccess(request, body.userId);
  if ("error" in access) return access.error;
  const userId = access.workspaceId;
  const enabled = body.enabled;
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const { data: store } = await supabaseAdmin
    .from("shopify_stores")
    .select("shop_domain, access_token, webhook_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!store?.shop_domain || !store?.access_token) {
    return NextResponse.json({ error: "No Shopify store connected" }, { status: 400 });
  }

  const shop = store.shop_domain;
  const token = store.access_token;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (enabled) {
    // ACTIVER : enregistrer le webhook orders/create cote Shopify.
    let webhookId: string | null = null;
    try {
      const res = await fetch(
        `https://${shop}/admin/api/2024-01/webhooks.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: {
              topic: "orders/create",
              address: `${appUrl}/api/shopify/orders`,
              format: "json",
            },
          }),
        }
      );
      const payload = await res.json().catch(() => ({}));
      if (payload?.webhook?.id) {
        webhookId = String(payload.webhook.id);
      } else if (res.status === 422) {
        // Webhook deja existant : on le retrouve pour stocker son id.
        const listRes = await fetch(
          `https://${shop}/admin/api/2024-01/webhooks.json?topic=orders/create`,
          { headers: { "X-Shopify-Access-Token": token } }
        );
        const list = await listRes.json().catch(() => ({}));
        const existing = (list?.webhooks || []).find(
          (w: { address?: string; id?: number }) => w.address === `${appUrl}/api/shopify/orders`
        );
        if (existing?.id) webhookId = String(existing.id);
      }
    } catch {
      return NextResponse.json({ error: "Failed to register webhook" }, { status: 500 });
    }

    await supabaseAdmin
      .from("shopify_stores")
      .update({ sync_enabled: true, webhook_id: webhookId })
      .eq("user_id", userId);

    return NextResponse.json({ ok: true, enabled: true, webhookId });
  } else {
    // DESACTIVER : supprimer le webhook cote Shopify s'il existe.
    if (store.webhook_id) {
      try {
        await fetch(
          `https://${shop}/admin/api/2024-01/webhooks/${store.webhook_id}.json`,
          { method: "DELETE", headers: { "X-Shopify-Access-Token": token } }
        );
      } catch {
        /* on continue meme si la suppression echoue cote Shopify */
      }
    }

    await supabaseAdmin
      .from("shopify_stores")
      .update({ sync_enabled: false, webhook_id: null })
      .eq("user_id", userId);

    return NextResponse.json({ ok: true, enabled: false });
  }
}
