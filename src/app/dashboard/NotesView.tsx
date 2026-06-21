"use client";

import { useLang } from "@/lib/useLang";
import { WorkspaceNotes } from "./WorkspaceNotes";

function NotesPageHeader({
  isMobile,
  title,
  subtitle,
}: {
  isMobile?: boolean;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        paddingTop: isMobile ? 56 : 40,
        paddingRight: isMobile ? 16 : 40,
        paddingBottom: isMobile ? 16 : 24,
        paddingLeft: isMobile ? 16 : 40,
        borderBottom: "1px solid #EFEFEF",
        background: "#FFFFFF",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 6 : 0 }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function NotesView({ isMobile, userId }: { isMobile?: boolean; userId?: string }) {
  const lang = useLang();

  return (
    <>
      <NotesPageHeader
        isMobile={isMobile}
        title={lang === "fr" ? "Notes" : "Notes"}
        subtitle={
          lang === "fr"
            ? "Un espace libre pour noter vos objectifs, idées et priorités créateurs."
            : "A free space to jot down your goals, ideas, and creator priorities."
        }
      />
      <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 16 : 32, width: "100%", boxSizing: "border-box" }}>
        <WorkspaceNotes userId={userId} isMobile={isMobile} variant="page" />
      </div>
    </>
  );
}
