"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
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

/** Stagger delays (ms) for bubbly doodle pop-in. */
const ICON_POP_DELAYS_MS = [0, 70, 130, 40, 190, 100, 160, 220] as const;

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
  delayMs: number;
  children: ReactNode;
};

function ChaoticIcon({ id, label, className, delayMs, children }: ChaoticIconProps) {
  return (
    <div
      id={id}
      className={className}
      data-chaotic-type="icon"
      data-chaotic-id={id}
      aria-label={label}
      title={label}
      style={{ "--chaotic-pop-delay": `${delayMs}ms` } as CSSProperties}
    >
      <div className="chaotic-work__icon-inner">{children}</div>
    </div>
  );
}

export function ChaoticWorkSection({ lang }: { lang: Lang }) {
  const rootRef = useRef<HTMLDivElement>(null);
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

  const iconEntries = [
    {
      id: icons.figma,
      label: "Icon: Gmail",
      className: "chaotic-work__icon chaotic-work__icon--figma",
      delayMs: ICON_POP_DELAYS_MS[0],
      body: (
        <>
          <div className="chaotic-work__app">
            <img src="/gmail-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
          <span className="chaotic-work__dot chaotic-work__dot--red" aria-hidden />
        </>
      ),
    },
    {
      id: icons.calendar,
      label: "Icon: Calendar",
      className: "chaotic-work__icon chaotic-work__icon--calendar",
      delayMs: ICON_POP_DELAYS_MS[1],
      body: (
        <>
          <div className="chaotic-work__app chaotic-work__app--calendar">
            <span className="chaotic-work__calendar-day">MON</span>
            <span className="chaotic-work__calendar-num">31</span>
          </div>
          <span className="chaotic-work__badge chaotic-work__badge--red chaotic-work__badge--99">99+</span>
        </>
      ),
    },
    {
      id: icons.slack,
      label: "Icon: TikTok",
      className: "chaotic-work__icon chaotic-work__icon--slack",
      delayMs: ICON_POP_DELAYS_MS[2],
      body: (
        <>
          <div className="chaotic-work__app chaotic-work__app--tiktok">
            <img src="/tiktok-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
          <span className="chaotic-work__badge chaotic-work__badge--red chaotic-work__badge--1m">1M+</span>
        </>
      ),
    },
    {
      id: icons.meet,
      label: "Icon: Google Meet",
      className: "chaotic-work__icon chaotic-work__icon--meet",
      delayMs: ICON_POP_DELAYS_MS[3],
      body: (
        <div className="chaotic-work__app">
          <img src="/google-meet-logo.svg" alt="" className="chaotic-work__app-logo" />
        </div>
      ),
    },
    {
      id: icons.miro,
      label: "Icon: Google Drive",
      className: "chaotic-work__icon chaotic-work__icon--miro",
      delayMs: ICON_POP_DELAYS_MS[4],
      body: (
        <div className="chaotic-work__app chaotic-work__app--miro">
          <img src="/google-drive-logo.svg" alt="" className="chaotic-work__app-logo" />
        </div>
      ),
    },
    {
      id: icons.drive,
      label: "Icon: Microsoft Excel",
      className: "chaotic-work__icon chaotic-work__icon--drive",
      delayMs: ICON_POP_DELAYS_MS[5],
      body: (
        <div className="chaotic-work__app chaotic-work__app--drive">
          <img src="/microsoft-excel-logo.svg" alt="" className="chaotic-work__app-logo" />
        </div>
      ),
    },
    {
      id: icons.messages,
      label: "Icon: Instagram",
      className: "chaotic-work__icon chaotic-work__icon--messages",
      delayMs: ICON_POP_DELAYS_MS[6],
      body: (
        <>
          <div className="chaotic-work__app chaotic-work__app--messages">
            <img src="/instagram-logo.svg" alt="" className="chaotic-work__app-logo" />
          </div>
          <span className="chaotic-work__badge chaotic-work__badge--red chaotic-work__badge--420">420</span>
        </>
      ),
    },
    {
      id: icons.notion,
      label: "Icon: Claude",
      className: "chaotic-work__icon chaotic-work__icon--notion",
      delayMs: ICON_POP_DELAYS_MS[7],
      body: (
        <div className="chaotic-work__app chaotic-work__app--notion">
          <img src="/claude-logo.svg" alt="" className="chaotic-work__app-logo" />
        </div>
      ),
    },
  ] as const;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      root.classList.add("is-popped", "is-static");
      root.style.setProperty("--chaotic-fall-y", "0px");
      root.style.setProperty("--chaotic-fall-opacity", "1");
      return;
    }

    let popped = false;
    let raf = 0;

    const applyFall = () => {
      raf = 0;
      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight || 1;

      if (!popped) {
        root.style.setProperty("--chaotic-fall-y", "0px");
        root.style.setProperty("--chaotic-fall-opacity", "1");
        root.classList.remove("is-falling");
        return;
      }

      // Fall starts after the section has settled in view, then progresses with scroll.
      const start = vh * 0.42;
      const end = vh * -0.2;
      const raw = (start - rect.top) / (start - end);
      const progress = Math.min(1, Math.max(0, raw));
      // Ease-in-out for a clean drop, keep icons together.
      const eased = progress * progress * (3 - 2 * progress);
      const fallY = eased * Math.min(240, vh * 0.28);
      const opacity = 1 - eased * 0.9;

      root.style.setProperty("--chaotic-fall-y", `${fallY.toFixed(1)}px`);
      root.style.setProperty("--chaotic-fall-opacity", opacity.toFixed(3));
      root.classList.toggle("is-falling", eased > 0.02);
    };

    const onScrollOrResize = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(applyFall);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || popped) return;
        popped = true;
        root.classList.add("is-popped");
        onScrollOrResize();
      },
      { threshold: 0.28, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(root);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    onScrollOrResize();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={rootRef} className="chaotic-work fade-up" aria-label={ariaLabel}>
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
        {iconEntries.map((icon) => (
          <ChaoticIcon
            key={icon.id}
            id={icon.id}
            label={icon.label}
            className={icon.className}
            delayMs={icon.delayMs}
          >
            {icon.body}
          </ChaoticIcon>
        ))}
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
