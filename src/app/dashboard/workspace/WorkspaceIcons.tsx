import { MinoCompanion } from "@/components/MinoCompanion";

export function WsIcon({
  name,
  size = 18,
}: {
  name:
    | "home"
    | "findit"
    | "trackit"
    | "payit"
    | "planner"
    | "notes"
    | "whiteboard"
    | "analytics"
    | "ai"
    | "more"
    | "search"
    | "bell"
    | "call"
    | "mic"
    | "settings"
    | "theme"
    | "help"
    | "logout"
    | "plus"
    | "chevron"
    | "sparkle"
    | "list"
    | "users"
    | "campaign"
    | "invite"
    | "integrations"
    | "billing"
    | "inbox"
    | "tasks"
    | "camera"
    | "grid";
  size?: number;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" />
        </svg>
      );
    case "findit":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16.5 16.5L21 21" />
        </svg>
      );
    case "trackit":
      return (
        <svg {...props}>
          <path d="M4 7h16M4 12h10M4 17h13" />
          <circle cx="18" cy="12" r="2" />
        </svg>
      );
    case "payit":
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 15h3" />
        </svg>
      );
    case "planner":
      return (
        <svg {...props}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case "notes":
      return (
        <svg {...props}>
          <path d="M6 4h9l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case "camera":
      return (
        <svg {...props}>
          <rect x="2.25" y="5.75" width="12.5" height="12.5" rx="3.75" />
          <path d="M14.75 10.1 20.7 6.9c.55-.3 1.2.12 1.2.74v8.72c0 .62-.65 1.04-1.2.74l-5.95-3.2" />
        </svg>
      );
    case "grid":
      return (
        <svg {...props}>
          <rect x="2.75" y="2.75" width="7.75" height="7.75" rx="2.4" />
          <rect x="13.5" y="2.75" width="7.75" height="7.75" rx="2.4" />
          <rect x="2.75" y="13.5" width="7.75" height="7.75" rx="2.4" />
          <rect x="13.5" y="13.5" width="7.75" height="7.75" rx="2.4" />
        </svg>
      );
    case "whiteboard":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 21h8M12 18v3" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...props}>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 15v-4M12 15V8M16 15v-6" />
        </svg>
      );
    case "ai":
      return <MinoCompanion size={size} motion="soft" />;
    case "more":
      return (
        <svg {...props}>
          <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16.5 16.5L21 21" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M6 9a6 6 0 0112 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z" />
          <path d="M10 19a2 2 0 004 0" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...props} fill="currentColor" stroke="none">
          {/* Solid tray glyph — top lip + base with center notch */}
          <path d="M6.2 2.75h11.6c1.35 0 2.45 1.1 2.45 2.45v4.55H3.75V5.2c0-1.35 1.1-2.45 2.45-2.45z" />
          <path d="M3.75 12.35h4.55c.42 0 .8.24.98.62l.55 1.15c.18.38.56.62.98.62h2.38c.42 0 .8-.24.98-.62l.55-1.15c.18-.38.56-.62.98-.62h4.55V18.8c0 1.35-1.1 2.45-2.45 2.45H6.2c-1.35 0-2.45-1.1-2.45-2.45v-6.45z" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...props}>
          <path d="M9 11l2 2 4-4" />
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      );
    case "call":
      return (
        <svg {...props}>
          <path d="M8 5h3l1.5 4-2 1.5a10 10 0 004 4L16 12.5l4 1.5v3A2 2 0 0118 19C10.5 19 5 13.5 5 6a2 2 0 012-2h1z" />
        </svg>
      );
    case "mic":
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M6 11a6 6 0 0012 0M12 17v3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M4.9 6.5l1.4 1.4M17.7 16.1l1.4 1.4M3 12h2M19 12h2M4.9 17.5l1.4-1.4M17.7 7.9l1.4-1.4" />
        </svg>
      );
    case "theme":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 000 16V4z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "help":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 014.5 1.5c0 1.5-1.5 2-2 2.5M12 16.5h.01" />
        </svg>
      );
    case "logout":
      return (
        <svg {...props}>
          <path d="M10 6H6a2 2 0 00-2 2v8a2 2 0 002 2h4M14 16l4-4-4-4M8 12h10" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...props}>
          <path d="M8 5l7 7-7 7" />
        </svg>
      );
    case "sparkle":
      return <MinoCompanion size={size} motion="full" />;
    case "list":
      return (
        <svg {...props}>
          <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <circle cx="9" cy="9" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0111 0" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M19.5 19a4 4 0 00-3.5-3.9" />
        </svg>
      );
    case "campaign":
      return (
        <svg {...props}>
          <path d="M5 6h10l4 3-4 3H5V6z" />
          <path d="M5 12v6" />
        </svg>
      );
    case "invite":
      return (
        <svg {...props}>
          <circle cx="10" cy="9" r="3" />
          <path d="M3.5 19a6.5 6.5 0 0113 0M18 8v6M15 11h6" />
        </svg>
      );
    case "integrations":
      return (
        <svg {...props}>
          <path d="M8 4v4M16 4v4M6 8h4v4H6zM14 8h4v4h-4zM8 16h4v4H8zM14 14v6" />
        </svg>
      );
    case "billing":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18M8 15h4" />
        </svg>
      );
    default:
      return null;
  }
}
