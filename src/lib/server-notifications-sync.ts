import {
  pushNotification,
  type NotificationKind,
} from "@/lib/notifications-storage";

type ServerNotification = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function payloadString(payload: Record<string, unknown> | null, key: string): string {
  const value = payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function formatServerTime(iso: string, lang: "en" | "fr"): string {
  try {
    return new Date(iso).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return lang === "fr" ? "À l'instant" : "Just now";
  }
}

function composeNotification(
  lang: "en" | "fr",
  item: ServerNotification,
): { kind: NotificationKind; title: string; body: string } | null {
  const fr = lang === "fr";
  const name =
    payloadString(item.payload, "creatorName") ||
    (fr ? "Un créateur" : "A creator");

  switch (item.type) {
    case "creator_joined": {
      const handle = payloadString(item.payload, "handle");
      return {
        kind: "team",
        title: fr
          ? `${name} a rejoint votre dashboard`
          : `${name} joined your dashboard`,
        body: fr
          ? `Invitation acceptée${handle ? ` (@${handle.replace(/^@/, "")})` : ""}. Retrouvez-le dans Gérer les créateurs.`
          : `Invite accepted${handle ? ` (@${handle.replace(/^@/, "")})` : ""}. Find them in Manage creators.`,
      };
    }
    case "script_done": {
      const scriptTitle = payloadString(item.payload, "scriptTitle");
      return {
        kind: "campaign",
        title: fr
          ? `${name} a lu votre script`
          : `${name} read your script`,
        body: scriptTitle
          ? fr
            ? `« ${scriptTitle} » a été marqué comme fait.`
            : `"${scriptTitle}" was marked as done.`
          : fr
            ? "Le script a été marqué comme fait."
            : "The script was marked as done.",
      };
    }
    case "content_uploaded": {
      const title = payloadString(item.payload, "title");
      const fileName = payloadString(item.payload, "fileName");
      const label = title || fileName;
      return {
        kind: "campaign",
        title: fr
          ? `${name} a envoyé du contenu`
          : `${name} uploaded content`,
        body: label
          ? fr
            ? `« ${label} » est disponible dans Contenu et dans vos campagnes.`
            : `"${label}" is available in Content and in your campaigns.`
          : fr
            ? "Un nouveau fichier est disponible dans Contenu."
            : "A new file is available in Content.",
      };
    }
    case "creator_message": {
      const preview = payloadString(item.payload, "preview");
      return {
        kind: "outreach",
        title: fr
          ? `${name} vous a envoyé un message`
          : `${name} sent you a message`,
        body: preview || (fr ? "Ouvrez l'inbox pour lire le message." : "Open your inbox to read the message."),
      };
    }
    default:
      return null;
  }
}

let syncInFlight = false;

/**
 * Récupère les notifications serveur (actions des créateurs) pour la marque,
 * les importe dans l'inbox locale (avec le son), puis accuse réception.
 */
export async function syncBrandServerNotifications(
  userId: string,
  lang: "en" | "fr",
): Promise<number> {
  if (typeof window === "undefined" || !userId || syncInFlight) return 0;
  syncInFlight = true;
  try {
    const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { ok?: boolean; items?: ServerNotification[] };
    const items = data?.ok ? (data.items ?? []) : [];
    if (!items.length) return 0;

    let imported = 0;
    for (const item of items) {
      const composed = composeNotification(lang, item);
      if (!composed) continue;
      const pushed = pushNotification(
        {
          ...composed,
          time: formatServerTime(item.created_at, lang),
        },
        userId,
      );
      if (pushed) imported += 1;
    }

    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId, ids: items.map((i) => i.id) }),
    }).catch(() => null);

    return imported;
  } catch {
    return 0;
  } finally {
    syncInFlight = false;
  }
}
