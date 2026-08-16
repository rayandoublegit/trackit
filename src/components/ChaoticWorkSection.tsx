"use client";

import { useEffect, useRef, type ReactNode } from "react";
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

const ICON_FLIGHT = [
  { x: -120, y: -280, r: -16, delay: 0, arc: -36 },
  { x: -40, y: -320, r: 12, delay: 0.06, arc: 28 },
  { x: 36, y: -340, r: -10, delay: 0.11, arc: -22 },
  { x: 140, y: -290, r: 16, delay: 0.04, arc: 40 },
  { x: 170, y: -210, r: -8, delay: 0.16, arc: 24 },
  { x: -90, y: -230, r: 10, delay: 0.09, arc: -30 },
  { x: 12, y: -200, r: -12, delay: 0.13, arc: 18 },
  { x: 150, y: -200, r: 11, delay: 0.18, arc: 32 },
] as const;

const ICON_PILE = [
  { x: -6, y: -5, r: -11, z: 1 },
  { x: 3, y: -6, r: 7, z: 2 },
  { x: -4, y: 0, r: -4, z: 3 },
  { x: 6, y: -1, r: 10, z: 4 },
  { x: -5, y: 5, r: 5, z: 5 },
  { x: 2, y: 6, r: -8, z: 6 },
  { x: 7, y: 4, r: 3, z: 7 },
  { x: 0, y: 8, r: -6, z: 8 },
] as const;

const PILE_SCALE = 0.78;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function smootherstep(t: number) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

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
  wrapRef: (el: HTMLDivElement | null) => void;
  innerRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
};

function ChaoticIcon({ id, label, className, wrapRef, innerRef, children }: ChaoticIconProps) {
  return (
    <div
      id={id}
      ref={wrapRef}
      className={className}
      data-chaotic-type="icon"
      data-chaotic-id={id}
      aria-label={label}
      title={label}
    >
      <div ref={innerRef} className="chaotic-work__icon-inner">
        {children}
      </div>
    </div>
  );
}

export function ChaoticWorkSection({ lang }: { lang: Lang }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iconWrapsRef = useRef<Array<HTMLDivElement | null>>([]);
  const iconInnersRef = useRef<Array<HTMLDivElement | null>>([]);
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
    const settle = () => {
      root.style.setProperty("--chaotic-lines-o", "1");
      iconInnersRef.current.forEach((el) => {
        if (!el) return;
        el.style.setProperty("--fly-x", "0px");
        el.style.setProperty("--fly-y", "0px");
        el.style.setProperty("--fly-r", "0deg");
        el.style.setProperty("--fly-o", "1");
        el.style.setProperty("--gather-s", "1");
      });
    };

    if (reducedMotion) {
      settle();
      return;
    }

    const motion = ICON_FLIGHT.map((flight) => ({
      x: flight.x,
      y: flight.y,
      r: flight.r,
      o: 0,
      s: 1,
      wx: 0,
      wy: 0,
    }));
    const rest = ICON_FLIGHT.map(() => ({ x: 0, y: 0, w: 60, h: 60 }));
    let restReady = false;
    let gathering = false;

    let raf = 0;
    let ticking = false;

    const cacheRest = () => {
      iconInnersRef.current.forEach((el, i) => {
        if (!el) return;
        const box = el.getBoundingClientRect();
        rest[i] = {
          x: box.left + box.width / 2 + window.scrollX,
          y: box.top + box.height / 2 + window.scrollY,
          w: box.width,
          h: box.height,
        };
      });
      restReady = rest.every((item) => item.w > 0 && item.h > 0);
    };

    const clearDockStyles = () => {
      iconWrapsRef.current.forEach((wrap) => {
        if (!wrap) return;
        wrap.style.left = "";
        wrap.style.top = "";
        wrap.style.width = "";
        wrap.style.height = "";
        wrap.style.zIndex = "";
        wrap.style.removeProperty("--dock-x");
        wrap.style.removeProperty("--dock-y");
        wrap.style.removeProperty("--dock-w");
        wrap.style.removeProperty("--dock-h");
      });
    };

    const pinIcons = (nextGather: boolean) => {
      if (nextGather === gathering) return;
      gathering = nextGather;
      if (gathering) {
        motion.forEach((item, i) => {
          item.wx = rest[i].x - window.scrollX;
          item.wy = rest[i].y - window.scrollY;
          const wrap = iconWrapsRef.current[i];
          if (!wrap) return;
          wrap.style.setProperty("--dock-x", `${(item.wx - rest[i].w / 2).toFixed(2)}px`);
          wrap.style.setProperty("--dock-y", `${(item.wy - rest[i].h / 2).toFixed(2)}px`);
          wrap.style.setProperty("--dock-w", `${rest[i].w}px`);
          wrap.style.setProperty("--dock-h", `${rest[i].h}px`);
        });
        root.classList.add("is-gathering");
        return;
      }
      root.classList.remove("is-gathering");
      clearDockStyles();
    };

    const apply = () => {
      ticking = false;
      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const start = vh * 0.94;
      const end = vh * 0.2;
      const progress = clamp01((start - rect.top) / Math.max(1, start - end));
      const scale = Math.min(1, Math.max(0.62, vh / 860));
      const dock = document.querySelector<HTMLElement>(".features-icon-dock");
      const dockBox = dock?.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const tFall = clamp01((-rect.top) / Math.max(1, vh));
      const tPack = clamp01((tFall - 0.18) / 0.82);
      let moving = false;

      if (!gathering) cacheRest();
      const shouldGather = tFall > 0.001 && restReady;
      pinIcons(shouldGather);

      const avgRestX = rest.reduce((sum, item) => sum + item.x, 0) / rest.length;
      const avgRestY = rest.reduce((sum, item) => sum + item.y, 0) / rest.length;
      const dockPageX = dockBox
        ? dockBox.left + dockBox.width / 2 + scrollX
        : avgRestX;
      const dockPageY = dockBox
        ? dockBox.top + dockBox.height / 2 + scrollY
        : avgRestY;
      const pileScale = Math.min(1.05, Math.max(0.85, (dockBox?.width ?? 64) / 64));

      document.getElementById("features")?.style.setProperty("--features-gather", tPack.toFixed(3));

      ICON_FLIGHT.forEach((flight, i) => {
        const local = clamp01((progress - flight.delay) / (1 - flight.delay));
        const eased = easeOutCubic(local);
        const remain = 1 - eased;
        const enterX = (flight.x * remain + Math.sin(eased * Math.PI) * flight.arc) * scale;
        const enterY = flight.y * remain * scale;
        const enterR = flight.r * remain;
        const enterO = eased;
        const wrap = iconWrapsRef.current[i];
        const el = iconInnersRef.current[i];
        const pile = ICON_PILE[i];
        const current = motion[i];

        if (shouldGather && wrap && el && pile) {
          const local = clamp01((tFall - i * 0.018) / 0.92);
          const gather = clamp01((local - 0.16) / 0.84);
          const slotX = dockPageX + pile.x * pileScale;
          const slotY = dockPageY + pile.y * pileScale;
          const worldX = lerp(rest[i].x, slotX, gather) - scrollX;
          const worldY = lerp(rest[i].y, slotY, local) - scrollY;
          const size = lerp(1, PILE_SCALE * pileScale, gather);
          const rot = pile.r * gather;
          current.wx = worldX;
          current.wy = worldY;
          current.r = rot;
          current.s = size;
          current.o = 1;
          wrap.style.setProperty("--dock-x", `${(worldX - rest[i].w / 2).toFixed(2)}px`);
          wrap.style.setProperty("--dock-y", `${(worldY - rest[i].h / 2).toFixed(2)}px`);
          wrap.style.setProperty("--dock-w", `${rest[i].w}px`);
          wrap.style.setProperty("--dock-h", `${rest[i].h}px`);
          wrap.style.zIndex = String(20 + pile.z);
          el.style.setProperty("--fly-x", "0px");
          el.style.setProperty("--fly-y", "0px");
          el.style.setProperty("--fly-r", `${rot.toFixed(2)}deg`);
          el.style.setProperty("--fly-o", "1");
          el.style.setProperty("--gather-s", size.toFixed(3));
          return;
        }

        current.x += (enterX - current.x) * (progress >= 0.999 ? 1 : 0.16);
        current.y += (enterY - current.y) * (progress >= 0.999 ? 1 : 0.16);
        current.r += (enterR - current.r) * (progress >= 0.999 ? 1 : 0.16);
        current.o += (enterO - current.o) * (progress >= 0.999 ? 1 : 0.16);
        current.s += (1 - current.s) * (progress >= 0.999 ? 1 : 0.16);

        if (
          Math.abs(enterX - current.x) > 0.2 ||
          Math.abs(enterY - current.y) > 0.2 ||
          Math.abs(enterO - current.o) > 0.008
        ) {
          moving = true;
        }

        if (!el) return;
        el.style.setProperty("--fly-x", `${current.x.toFixed(2)}px`);
        el.style.setProperty("--fly-y", `${current.y.toFixed(2)}px`);
        el.style.setProperty("--fly-r", `${current.r.toFixed(2)}deg`);
        el.style.setProperty("--fly-o", current.o.toFixed(3));
        el.style.setProperty("--gather-s", current.s.toFixed(3));
      });

      root.style.setProperty(
        "--chaotic-lines-o",
        (easeOutCubic(clamp01((progress - 0.38) / 0.5)) * (1 - tFall)).toFixed(3),
      );

      if (moving) {
        ticking = true;
        raf = window.requestAnimationFrame(apply);
      }
    };

    const requestTick = () => {
      if (ticking) return;
      ticking = true;
      raf = window.requestAnimationFrame(apply);
    };

    requestTick();
    window.addEventListener("scroll", requestTick, { passive: true, capture: true });
    document.addEventListener("scroll", requestTick, { passive: true, capture: true });
    window.addEventListener("resize", requestTick);
    window.visualViewport?.addEventListener("scroll", requestTick);
    window.visualViewport?.addEventListener("resize", requestTick);

    return () => {
      window.removeEventListener("scroll", requestTick, true);
      document.removeEventListener("scroll", requestTick, true);
      window.removeEventListener("resize", requestTick);
      window.visualViewport?.removeEventListener("scroll", requestTick);
      window.visualViewport?.removeEventListener("resize", requestTick);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={rootRef} className="chaotic-work" aria-label={ariaLabel}>
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
        {iconEntries.map((icon, index) => (
          <ChaoticIcon
            key={icon.id}
            id={icon.id}
            label={icon.label}
            className={icon.className}
            wrapRef={(el) => {
              iconWrapsRef.current[index] = el;
            }}
            innerRef={(el) => {
              iconInnersRef.current[index] = el;
            }}
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
