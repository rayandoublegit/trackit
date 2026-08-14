"use client";

import { useLang } from "@/lib/useLang";
import type { DashboardView } from "@/lib/dashboard-view-storage";
import type { NotificationItem } from "./NotificationsView";
import { WsIcon } from "./workspace/WorkspaceIcons";

export function InboxView({
  isMobile,
  onNavigate,
}: {
  userId?: string;
  isMobile?: boolean;
  onUnreadChange?: (count: number) => void;
  onOpenAction?: (action: NonNullable<NotificationItem["action"]>) => void;
  onNavigate?: (view: DashboardView) => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--ws-surface, #fff)",
      }}
    >
      <div
        style={{
          padding: isMobile ? "22px 18px 8px" : "28px 40px 10px",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: isMobile ? 26 : 30,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            color: "var(--ws-text, #111)",
          }}
        >
          Inbox
        </h1>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "24px 20px 48px" : "32px 40px 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            maxWidth: 360,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              border: "1px solid var(--ws-border, #E8E8EA)",
              background: "var(--ws-pill, #F4F4F5)",
              display: "grid",
              placeItems: "center",
              marginBottom: 22,
              color: "var(--ws-accent, #0047ff)",
            }}
            className="inbox-empty-icon"
          >
            <WsIcon name="invite" size={26} />
          </div>

          <p
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 650,
              letterSpacing: "-0.035em",
              color: "var(--ws-text, #111)",
              lineHeight: 1.3,
            }}
          >
            {fr
              ? "Il semblerait que votre inbox soit encore calme"
              : "Looks like your inbox is still quiet"}
          </p>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14.5,
              lineHeight: 1.45,
              letterSpacing: "-0.02em",
              color: "var(--ws-text-muted, #8E8E93)",
            }}
          >
            {fr
              ? "Invitez un créateur — les premières notifications arriveront ici."
              : "Invite a creator — the first notifications will land here."}
          </p>

          <button
            type="button"
            onClick={() => onNavigate?.("discovery")}
            style={{
              marginTop: 22,
              border: "none",
              borderRadius: 999,
              padding: "11px 22px",
              background: "var(--ws-btn, #111)",
              color: "var(--ws-btn-text, #fff)",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
              letterSpacing: "-0.02em",
              cursor: "pointer",
            }}
          >
            {fr ? "Inviter un créateur" : "Invite a creator"}
          </button>
        </div>
      </div>
    </div>
  );
}
