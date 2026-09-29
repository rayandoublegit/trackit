// Shown when a person or a workspace has no picture: a real icon, never initials.

export function PersonGlyph({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <circle cx="12" cy="8.5" r="3.6" fill={color} opacity=".85" />
      <path d="M4.8 20.2c.6-3.7 3.6-6.2 7.2-6.2s6.6 2.5 7.2 6.2" stroke={color} strokeWidth="2" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

export function WorkspaceGlyph({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
      <path d="M5 13.5V20h14v-6.5M10 20v-4h4v4" />
    </svg>
  );
}

export function CommunityGlyph({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
