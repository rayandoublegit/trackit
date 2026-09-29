"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MinoCompanion } from "@/components/MinoCompanion";
import { PlatformLogo } from "@/components/PlatformLogo";
import { setActiveMinoChatId, setPendingMinoPrompt } from "@/lib/mino-chats-storage";
import type { DashboardView } from "@/lib/dashboard-view-storage";
import "./home-mino.css";

// Home opens on Mino: ask anything, and the chat view picks the question up.

const ROTATING = [
  "Find micro fitness creators on TikTok",
  "Beauty creators in France with an email",
  "Skincare creators on Instagram, 50K+",
  "Create a campaign for my new drop",
  "Pay a creator",
];

function useRotatingPlaceholder(): string {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [back, setBack] = useState(false);
  const full = ROTATING[i];
  useEffect(() => {
    const done = back ? n === 0 : n >= full.length;
    const t = window.setTimeout(
      () => {
        if (!back && n >= full.length) return setBack(true);
        if (back && n === 0) {
          setBack(false);
          setI((x) => (x + 1) % ROTATING.length);
          return;
        }
        setN((x) => x + (back ? -1 : 1));
      },
      done ? (back ? 300 : 2200) : back ? 22 : 55,
    );
    return () => window.clearTimeout(t);
  }, [n, back, full.length]);
  return full.slice(0, n);
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const CHIPS: { text: string; icon: ReactNode }[] = [
  { text: "Find micro fitness creators on TikTok", icon: <PlatformLogo platform="tiktok" size={15} /> },
  { text: "Find beauty creators on Instagram in France", icon: <PlatformLogo platform="instagram" size={15} /> },
  {
    text: "Find skincare creators with an email",
    icon: (
      <Icon>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </Icon>
    ),
  },
  {
    text: "Create a new campaign",
    icon: (
      <Icon>
        <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </Icon>
    ),
  },
  {
    text: "Pay a creator",
    icon: (
      <Icon>
        <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
        <circle cx="16.5" cy="14" r="1.2" fill="currentColor" />
      </Icon>
    ),
  },
];

export function MinoHomeHero({
  firstName,
  userId,
  isMobile,
  onNavigate,
}: {
  firstName: string;
  userId?: string;
  isMobile?: boolean;
  onNavigate: (view: DashboardView) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholder = useRotatingPlaceholder();

  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    // Start fresh: the chat view routes creator searches to the chat and other
    // asks (pay, open, create) to Mino's actions.
    setActiveMinoChatId(userId, null);
    onNavigate("ai");
    window.setTimeout(() => setPendingMinoPrompt(userId, q), 60);
  };

  return (
    <section className={`hm-hero${isMobile ? " is-mobile" : ""}`} aria-labelledby="hm-title">
      <div className="hm-hero__aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="hm-hero__mino" aria-hidden>
        <MinoCompanion size={isMobile ? 56 : 68} />
      </div>
      <h1 id="hm-title" className="hm-hero__title">
        {firstName ? `Hi ${firstName}, what should Mino do?` : "What should Mino do?"}
      </h1>
      <p className="hm-hero__sub">Mino finds creators across TikTok and Instagram, starts campaigns and opens anything in Trackit.</p>

      <form
        className="mtg-promptbox hm-hero__box"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <div className="mtg-promptbox__led" aria-hidden>
          <span className="mtg-promptbox__led-spin" />
        </div>
        <div className="mtg-promptbox__glow" aria-hidden>
          <span className="mtg-promptbox__led-spin" />
        </div>
        <div className="hm-hero__field">
          <MinoCompanion size={20} />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder || "Ask Mino"}
            aria-label="Ask Mino"
          />
          <button type="submit" className="hm-hero__send" disabled={!text.trim()} aria-label="Send to Mino">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      <div className="hm-hero__chips">
        {CHIPS.map((c, i) => (
          <button key={c.text} type="button" className="hm-chip" style={{ ["--i" as string]: i }} onClick={() => ask(c.text)}>
            <span className="hm-chip__icon">{c.icon}</span>
            {c.text}
          </button>
        ))}
      </div>
    </section>
  );
}
