import type { ReactNode } from "react";
import type { Lang } from "@/lib/useLang";

/** Styles: src/app/chaotic-work.css (guarded by landing-css.guard.test.ts). */
export const CHAOTIC_PART_IDS = {
  lines: {
    figmaCalendar: "chaotic-line-figma-calendar",
    meetMiro: "chaotic-line-meet-miro",
    messagesNotion: "chaotic-line-messages-notion",
  },
  icons: {
    figma: "chaotic-icon-figma",
    calendar: "chaotic-icon-calendar",
    slack: "chaotic-icon-slack",
    meet: "chaotic-icon-meet",
    miro: "chaotic-icon-miro",
    drive: "chaotic-icon-drive",
    messages: "chaotic-icon-messages",
    notion: "chaotic-icon-notion",
  },
} as const;

type ChaoticLineProps = {
  id: string;
  label: string;
  d: string;
  fadeEnd?: boolean;
  gradient?: { x1: number; y1: number; x2: number; y2: number };
};

function ChaoticLine({ id, label, d, fadeEnd, gradient }: ChaoticLineProps) {
  const gradientId = `chaotic-grad-${id}`;

  return (
    <g
      id={id}
      className="chaotic-work__line"
      data-chaotic-type="line"
      data-chaotic-id={id}
      aria-label={label}
    >
      {fadeEnd && gradient && (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={gradient.x1}
            y1={gradient.y1}
            x2={gradient.x2}
            y2={gradient.y2}
          >
            <stop offset="0%" stopColor="#111111" stopOpacity="0.95" />
            <stop offset="72%" stopColor="#111111" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#111111" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      <path
        d={d}
        stroke={fadeEnd ? `url(#${gradientId})` : "#1A1A1A"}
        strokeWidth="1.25"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

type ChaoticIconProps = {
  id: string;
  label: string;
  className: string;
  children: ReactNode;
};

function ChaoticIcon({ id, label, className, children }: ChaoticIconProps) {
  return (
    <div
      id={id}
      className={className}
      data-chaotic-type="icon"
      data-chaotic-id={id}
      aria-label={label}
      title={label}
    >
      {children}
    </div>
  );
}

export function ChaoticWorkSection({ lang }: { lang: Lang }) {
  const { lines, icons } = CHAOTIC_PART_IDS;
  const titleLine1 =
    lang === "fr" ? "La façon dont vous collaborez" : "The current way you're";
  const titleLine2 =
    lang === "fr" ? (
      <>
        aujourd&apos;hui est <span className="chaotic-work__title-emphasis">chaotique.</span>
      </>
    ) : (
      <>
        partnering is <span className="chaotic-work__title-emphasis">chaotic.</span>
      </>
    );
  const ariaLabel =
    lang === "fr"
      ? "La façon dont vous collaborez aujourd'hui est chaotique."
      : "The current way you're partnering is chaotic.";
  const stats =
    lang === "fr"
      ? [
          "500+ heures/an perdues à chercher des créateurs.",
          "6 tableurs ouverts pour une seule campagne.",
          "2x plus de temps perdu à jongler entre outils.",
        ]
      : [
          "500+ hours/year lost searching for creators.",
          "6 spreadsheets open for a single campaign.",
          "2x more time wasted switching between tools.",
        ];

  return (
    <div className="chaotic-work fade-up" aria-label={ariaLabel}>
      <div className="chaotic-work__lines-layer" data-chaotic-layer="lines">
        <svg className="chaotic-work__lines" viewBox="0 0 1024 713" fill="none" aria-hidden>
          <ChaoticLine
            id={lines.figmaCalendar}
            label="Curve: Gmail → Calendar"
            d="M 100 160 Q 172 143, 258 78"
            fadeEnd
            gradient={{ x1: 100, y1: 160, x2: 258, y2: 78 }}
          />
          <ChaoticLine
            id={lines.meetMiro}
            label="Curve: Google Meet → Miro"
            d="M 808 104 Q 832 205, 922 252"
            fadeEnd
            gradient={{ x1: 808, y1: 104, x2: 922, y2: 252 }}
          />
          <ChaoticLine
            id={lines.messagesNotion}
            label="Curve: Messages → Notion"
            d="M 595 425 Q 662 395, 728 439"
            fadeEnd
            gradient={{ x1: 595, y1: 425, x2: 728, y2: 439 }}
          />
        </svg>
      </div>

      <div className="chaotic-work__icons-layer" data-chaotic-layer="icons">
        <ChaoticIcon id={icons.figma} label="Icon: Gmail" className="chaotic-work__icon chaotic-work__icon--figma">
          <div className="chaotic-work__app">
            <img src="/gmail-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
          <span className="chaotic-work__dot chaotic-work__dot--red" aria-hidden />
        </ChaoticIcon>

        <ChaoticIcon id={icons.calendar} label="Icon: Calendar" className="chaotic-work__icon chaotic-work__icon--calendar">
          <div className="chaotic-work__app chaotic-work__app--calendar">
            <span className="chaotic-work__calendar-day">MON</span>
            <span className="chaotic-work__calendar-num">31</span>
          </div>
          <span className="chaotic-work__badge chaotic-work__badge--red chaotic-work__badge--99">99+</span>
        </ChaoticIcon>

        <ChaoticIcon id={icons.slack} label="Icon: TikTok" className="chaotic-work__icon chaotic-work__icon--slack">
          <div className="chaotic-work__app chaotic-work__app--tiktok">
            <img src="/tiktok-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
          <span className="chaotic-work__badge chaotic-work__badge--red chaotic-work__badge--1m">1M+</span>
        </ChaoticIcon>

        <ChaoticIcon id={icons.meet} label="Icon: Google Meet" className="chaotic-work__icon chaotic-work__icon--meet">
          <div className="chaotic-work__app">
            <img src="/google-meet-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
        </ChaoticIcon>

        <ChaoticIcon id={icons.miro} label="Icon: Google Drive" className="chaotic-work__icon chaotic-work__icon--miro">
          <div className="chaotic-work__app chaotic-work__app--miro">
            <img src="/google-drive-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
        </ChaoticIcon>

        <ChaoticIcon id={icons.drive} label="Icon: Microsoft Excel" className="chaotic-work__icon chaotic-work__icon--drive">
          <div className="chaotic-work__app chaotic-work__app--drive">
            <img src="/microsoft-excel-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
        </ChaoticIcon>

        <ChaoticIcon id={icons.messages} label="Icon: Instagram" className="chaotic-work__icon chaotic-work__icon--messages">
          <div className="chaotic-work__app chaotic-work__app--messages">
            <img src="/instagram-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
          <span className="chaotic-work__badge chaotic-work__badge--red chaotic-work__badge--420">420</span>
        </ChaoticIcon>

        <ChaoticIcon id={icons.notion} label="Icon: Claude" className="chaotic-work__icon chaotic-work__icon--notion">
          <div className="chaotic-work__app chaotic-work__app--notion">
            <img src="/claude-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
        </ChaoticIcon>
      </div>

      <div className="chaotic-work__content" data-chaotic-layer="content">
        <h2 className={`chaotic-work__title${lang === "fr" ? " chaotic-work__title--fr" : ""}`}>
          <span className="chaotic-work__title-line">{titleLine1}</span>
          <span className="chaotic-work__title-line">{titleLine2}</span>
        </h2>
        <div className="chaotic-work__stats">
          {stats.map((stat) => (
            <p key={stat}>{stat}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
