"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Script from "next/script";
import type { User } from "@supabase/supabase-js";

import { handleUpgrade } from "@/lib/checkout";
import {
  getPriceIdForUpgradeTarget,
  getPricingCta,
  type PlanTier,
} from "@/lib/pricing-cta";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useRequireActiveSubscription } from "@/lib/use-require-active-subscription";

const PROFILE_DROPDOWN_ITEM_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 16px",
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,1)",
  fontFamily: "'Inter', sans-serif",
  fontSize: 17,
  fontWeight: 600,
  letterSpacing: "-0.04em",
  lineHeight: 1.0,
  cursor: "pointer",
};

function profileInitials(user: User, profileUsername?: string | null): string {
  const fromProfile = profileUsername?.trim();
  if (fromProfile) return fromProfile.slice(0, 2).toUpperCase();
  const meta =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined);
  if (meta?.trim()) {
    const parts = meta.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const email = user.email ?? "";
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

const QUESTIONS = [
  {
    label: "01 →",
    question: "What's your idea in one sentence?",
    hint: "The problem, who has it, and how you solve it.",
    placeholder:
      "e.g. An AI tool that helps solo founders validate their SaaS idea before building anything...",
  },
  {
    label: "02 →",
    question: "Who is your exact target customer?",
    hint: "Not a category — a specific person. Job title, company size, daily frustration.",
    placeholder:
      "e.g. Solo SaaS founders aged 25-35 who keep building products nobody wants...",
  },
  {
    label: "03 →",
    question: "Why do you believe this is a real problem?",
    hint: "Did you experience it yourself or observe it in others?",
    placeholder:
      "e.g. I built 3 products in 12 months with zero paying customers because I never validated...",
  },
  {
    label: "04 →",
    question: "What existing solutions are people using right now?",
    hint: "Even bad ones. Spreadsheets, manual processes, expensive tools.",
    placeholder:
      "e.g. They ask ChatGPT, post on Reddit, or just wing it and hope for the best...",
  },
  {
    label: "05 →",
    question: "What's your unfair advantage?",
    hint: "Why you, why now?",
    placeholder:
      "e.g. I've lived this problem firsthand and know exactly what founders need...",
  },
  {
    label: "06 →",
    question: "Have you talked to anyone in your target market yet?",
    hint: "What did they say? Be specific.",
    placeholder:
      "e.g. I DMed 20 founders on Reddit. 8 responded. 3 said they'd pay for this today...",
  },
  {
    label: "07 →",
    question: "What's your email address?",
    hint: "We'll send your Kill or Build verdict here within 24 hours.",
    placeholder: "e.g. yourname@email.com",
  },
] as const;

type EmailJs = {
  send: (
    serviceId: string,
    templateId: string,
    templateParams: Record<string, string>,
    publicKey: string
  ) => Promise<unknown>;
};

export default function LandingPage() {
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    const check = async () => {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return;

      const { data: profile } = await client
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        await client.auth.signOut();
      }
    };
    void check();
  }, []);

  useRequireActiveSubscription();
  const [modalOpen, setModalOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => Array(7).fill(""));
  const [inputValue, setInputValue] = useState("");
  const [showInputError, setShowInputError] = useState(false);
  const [nextLabel, setNextLabel] = useState("OK, NEXT →");
  const [nextBusy, setNextBusy] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<"spark" | "build" | "scale">(
    "spark"
  );
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user) {
      setAvatarUrl(null);
      setUserPlan("spark");
      setProfileUsername(null);
      return;
    }
    void supabase
      .from("profiles")
      .select("username, avatar_url, plan")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Landing: profiles query error", error);
          setAvatarUrl(null);
          setUserPlan("spark");
          setProfileUsername(null);
          return;
        }
        if (!data) {
          setAvatarUrl(null);
          setUserPlan("spark");
          setProfileUsername(null);
          return;
        }
        setProfileUsername(
          typeof data.username === "string" && data.username.trim()
            ? data.username.trim()
            : null
        );
        const u = data.avatar_url;
        setAvatarUrl(typeof u === "string" && u ? u : null);
        const raw =
          (data.plan as string | undefined)?.toLowerCase() ?? "spark";
        setUserPlan(
          raw === "build" || raw === "scale" ? raw : "spark"
        );
      });
  }, [user]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSuccessOpen(false);
    document.body.style.overflow = "";
    setNextLabel("OK, NEXT →");
    setNextBusy(false);
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const openModal = useCallback(() => {
    setCurrent(0);
    setAnswers(Array(7).fill(""));
    setInputValue("");
    setShowInputError(false);
    setModalOpen(true);
    setSuccessOpen(false);
    setNextLabel("OK, NEXT →");
    setNextBusy(false);
    document.body.style.overflow = "hidden";
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (modalOpen) {
      setInputValue(answers[current] ?? "");
    }
  }, [current, modalOpen, answers]);

  useLayoutEffect(() => {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("hidden");
    });
  }, []);

  useEffect(() => {
    const reveals = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("hidden");
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const painCards = document.querySelectorAll<HTMLElement>(".pain-card");
    painCards.forEach((card, i) => {
      card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      if (i > 0) card.style.opacity = "0.4";
    });
    const onScroll = () => {
      const winH = window.innerHeight;
      painCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        if (center > 0 && center < winH) {
          card.style.opacity = "1";
          card.style.transform = "scale(1)";
        } else {
          card.style.opacity = "0.4";
          card.style.transform = "scale(0.97)";
        }
      });
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const triggerShake = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.classList.remove("shake");
    void input.offsetWidth;
    input.classList.add("shake");
  }, []);

  const submitForm = useCallback(async (finalAnswers: string[]) => {
    const email = finalAnswers[6];
    setNextLabel("Sending...");
    setNextBusy(true);
    try {
      const w = window as Window & { emailjs?: EmailJs };
      await w.emailjs?.send(
        "service_r02bz7",
        "template_71g18ls",
        {
          email,
          idea: finalAnswers[0],
          target_customer: finalAnswers[1],
          why_problem: finalAnswers[2],
          existing_solutions: finalAnswers[3],
          unfair_advantage: finalAnswers[4],
          market_conversations: finalAnswers[5],
        },
        "v2gJC8RuLeTrpUZid"
      );
      console.log("EmailJS sent successfully");
    } catch (e) {
      console.error("EmailJS error:", e);
    }
    setModalOpen(false);
    setSuccessOpen(true);
    setNextBusy(false);
    setNextLabel("OK, NEXT →");
  }, []);

  const handleNext = useCallback(async () => {
    const val = inputValue.trim();
    if (!val) {
      setShowInputError(true);
      triggerShake();
      return;
    }
    setShowInputError(false);
    const nextAnswers = [...answers];
    nextAnswers[current] = val;
    setAnswers(nextAnswers);

    const total = QUESTIONS.length;
    if (current < total - 1) {
      const content = modalContentRef.current;
      if (content) {
        content.style.opacity = "0";
        content.style.transform = "translateY(-8px)";
        setTimeout(() => {
          setCurrent((c) => c + 1);
          content.style.transition = "opacity 0.25s ease, transform 0.25s ease";
          content.style.opacity = "1";
          content.style.transform = "translateY(0)";
        }, 180);
      } else {
        setCurrent((c) => c + 1);
      }
    } else {
      await submitForm(nextAnswers);
    }
  }, [answers, current, inputValue, submitForm, triggerShake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!modalOpen) return;
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        void handleNext();
      }
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal, handleNext]);

  const handlePrev = () => {
    if (current === 0) return;
    const nextAnswers = [...answers];
    nextAnswers[current] = inputValue;
    setAnswers(nextAnswers);
    const content = modalContentRef.current;
    if (content) {
      content.style.opacity = "0";
      content.style.transform = "translateY(8px)";
      setTimeout(() => {
        setCurrent((c) => c - 1);
        content.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        content.style.opacity = "1";
        content.style.transform = "translateY(0)";
      }, 180);
    } else {
      setCurrent((c) => c - 1);
    }
  };

  useEffect(() => {
    if (!modalOpen) return;
    const total = QUESTIONS.length;
    setNextLabel(
      current === total - 1 ? "ANALYZE MY IDEA →" : "OK, NEXT →"
    );
    setShowInputError(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [current, modalOpen]);

  useEffect(() => {
    const video = document.getElementById("demoVideo") as HTMLVideoElement;
    const progress = document.getElementById("demoProgress") as HTMLInputElement;
    const timeEl = document.getElementById("demoTime");
    const volumeIcon = document.getElementById("volumeIcon");
    if (!video) return;
    const onTimeUpdate = () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      if (progress) progress.value = String(pct);
      const mins = Math.floor(video.currentTime / 60);
      const secs = Math.floor(video.currentTime % 60)
        .toString()
        .padStart(2, "0");
      if (timeEl) timeEl.textContent = `${mins}:${secs}`;
      if (volumeIcon) {
        volumeIcon.innerHTML = video.muted
          ? '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
          : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const q = QUESTIONS[current];
  const totalQ = QUESTIONS.length;
  const progressPct = ((current + 1) / totalQ) * 100;

  const scrollToServices = () => {
    document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
  };

  const renderPricingCta = (tier: PlanTier, featured: boolean) => {
    const loggedIn = !!user;
    const plan = loggedIn ? userPlan : null;
    const cta = getPricingCta(tier, { loggedIn, plan });
    const scaleCls = tier === "scale" ? " pricing-btn-scale" : "";

    if (cta.kind === "try-free") {
      return (
        <a
          href="/analyze"
          className={
            (featured ? "pricing-btn pricing-btn-light" : "pricing-btn pricing-btn-dark") +
            scaleCls
          }
        >
          {cta.label}
        </a>
      );
    }
    if (cta.kind === "current") {
      return (
        <span
          className={"pricing-cta-current" + scaleCls}
          aria-current="true"
        >
          {cta.label}
        </span>
      );
    }
    if (cta.kind === "downgrade") {
      return (
        <a href="/dashboard" className={"pricing-cta-downgrade" + scaleCls}>
          {cta.label}
        </a>
      );
    }
    const priceId = cta.upgradeTarget
      ? getPriceIdForUpgradeTarget(cta.upgradeTarget)
      : undefined;
    return (
      <button
        type="button"
        className={"pricing-cta-upgrade" + scaleCls}
        onClick={() => {
          if (!priceId) return;
          void handleUpgrade(priceId).catch(() => {});
        }}
      >
        {cta.label}
      </button>
    );
  };

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          const w = window as Window & {
            emailjs?: { init: (publicKey: string) => void };
          };
          w.emailjs?.init("v2gJC8RuLeTrpUZid");
        }}
      />
      <form
        name="klayan-analysis"
        method="POST"
        data-netlify="true"
        data-netlify-honeypot="bot-field"
        className="hidden-netlify-form"
        aria-hidden
      >
        <input type="text" name="bot-field" tabIndex={-1} autoComplete="off" />
        <input type="text" name="email" />
        <input type="text" name="01_Idea" />
        <input type="text" name="02_Target_Customer" />
        <input type="text" name="03_Why_Real_Problem" />
        <input type="text" name="04_Existing_Solutions" />
        <input type="text" name="05_Unfair_Advantage" />
        <input type="text" name="06_Market_Conversations" />
      </form>

      <nav>
        <div className="nav-logo">
          <img
            src="https://i.ibb.co/msYn5RH/navbarlogo.png"
            alt="Klayan"
            className="nav-logo-img"
          />
        </div>
        <div className="nav-right">
          <ul className="nav-links">
            <li>
              <a href="#services">Services</a>
            </li>
            <li>
              <a href="#pricing">Pricing</a>
            </li>
          </ul>
          <a href="/analyze" className="nav-cta">
            Analyze
          </a>
          {user ? (
            <div
              ref={profileMenuRef}
              style={{ position: "relative", marginLeft: 10, flexShrink: 0 }}
            >
              <button
                type="button"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                onClick={() => setProfileMenuOpen((o) => !o)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  background: avatarUrl ? "transparent" : "rgba(171,171,171,0.24)",
                  backdropFilter: avatarUrl ? undefined : "blur(8px)",
                  WebkitBackdropFilter: avatarUrl ? undefined : "blur(8px)",
                  color: "#fff",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  profileInitials(user, profileUsername)
                )}
              </button>
              {profileMenuOpen ? (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    minWidth: 200,
                    background: "rgba(22,22,22,0.96)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    padding: "8px 0",
                    zIndex: 10000,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      window.location.href = "/dashboard";
                    }}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    My Dashboard
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      window.location.href = "/analyze";
                    }}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    New Analysis
                  </button>
                  <div
                    style={{
                      height: 1,
                      background: "rgba(255,255,255,0.08)",
                      margin: "6px 0",
                    }}
                  />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      setProfileMenuOpen(false);
                      if (supabase) await supabase.auth.signOut();
                    }}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/auth";
              }}
              style={{
                marginLeft: 10,
                flexShrink: 0,
                border: "none",
                cursor: "pointer",
                background: "rgba(171,171,171,0.24)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                borderRadius: 100,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              <img
                src="https://i.ibb.co/msYn5RH/navbarlogo.png"
                alt=""
                width={24}
                height={24}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              Sign In
            </button>
          )}
        </div>
      </nav>

      <div className="hero-outer">
        <div className="hero-box">
          <section className="hero" id="hero">
            <div className="hero-content">
              <h1 className="hero-title">Stop Building</h1>
              <span className="hero-title-italic">Start Knowing.</span>
              <p className="hero-sub">
                The AI co-founder that tells you the truth about your idea then
                structures your business — before you waste 6 months building the
                wrong thing.
              </p>
              <div className="hero-cta-row">
                <a href="/analyze" className="hero-btn">
                  Analyze my idea
                </a>
                <div className="hero-divider" />
                <div className="hero-note">
                  Free to start · No credit card required
                  <button
                    type="button"
                    className="hero-scroll-btn"
                    onClick={scrollToServices}
                    aria-label="Scroll to services"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="demo-section">
        <div className="demo-video-wrap reveal">
          <video
            id="demoVideo"
            src="https://res.cloudinary.com/dqsk5btgz/video/upload/v1774400144/broski_ejduic.mp4"
            loop
            playsInline
            className="demo-video"
            onClick={() => {
              const video = document.getElementById(
                "demoVideo"
              ) as HTMLVideoElement;
              const btn = document.getElementById("demoPlayBtn");
              const controls = document.getElementById("demoControls");
              if (video.paused) {
                void video.play();
                if (btn) btn.classList.add("hidden");
                if (controls) controls.classList.add("visible");
              } else {
                video.pause();
                if (btn) btn.classList.remove("hidden");
                if (controls) controls.classList.remove("visible");
              }
            }}
          />
          <button
            type="button"
            className="demo-play-btn"
            id="demoPlayBtn"
            onClick={() => {
              const video = document.getElementById(
                "demoVideo"
              ) as HTMLVideoElement;
              const btn = document.getElementById("demoPlayBtn");
              const controls = document.getElementById("demoControls");
              void video.play();
              if (btn) btn.classList.add("hidden");
              if (controls) controls.classList.add("visible");
            }}
            aria-label="Play demo"
          >
            <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <div className="demo-controls" id="demoControls">
            <input
              type="range"
              className="demo-progress"
              id="demoProgress"
              min={0}
              max={100}
              defaultValue={0}
              onChange={(e) => {
                const video = document.getElementById(
                  "demoVideo"
                ) as HTMLVideoElement;
                video.currentTime =
                  (Number(e.target.value) / 100) * video.duration;
              }}
            />
            <span className="demo-time" id="demoTime">
              0:00
            </span>
            <button
              type="button"
              className="demo-ctrl-btn"
              id="demoMuteBtn"
              aria-label="Toggle mute"
              onClick={(e) => {
                e.stopPropagation();
                const video = document.getElementById(
                  "demoVideo"
                ) as HTMLVideoElement;
                const btn = document.getElementById("demoMuteBtn");
                video.muted = !video.muted;
                if (btn) btn.setAttribute("data-muted", String(video.muted));
              }}
            >
              <svg
                id="volumeIcon"
                viewBox="0 0 24 24"
                fill="white"
                width="18"
                height="18"
              >
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section className="familiar-section" id="services">
        <div className="familiar-inner">
          <div className="familiar-left">
            <h2 className="familiar-title">Sounds familiar ?</h2>
          </div>
          <div className="familiar-right">
            <div className="pain-card reveal">
              <div className="pain-card-title">
                You built something nobody wanted
              </div>
              <div className="pain-bubbles">
                <div className="bubble bubble-dark">
                  &quot;Sorry but we&apos;re not interested&quot;
                </div>
                <div className="pain-bubbles-row">
                  <div className="bubble bubble-white bubble-rotated">
                    &quot;We already got a better option&quot;
                  </div>
                  <div className="bubble bubble-yellow bubble-rotated2">
                    4 months wasted
                  </div>
                </div>
              </div>
              <p className="pain-desc">
                Spent 4 months coding. Launched to crickets. Found out the market
                didn&apos;t care.
              </p>
            </div>
            <div className="pain-card reveal reveal-delay-1">
              <div className="pain-card-title">
                You asked ChatGPT.
                <br />
                It said great idea.
              </div>
              <div className="pain-bubbles">
                <div className="chat-row">
                  <div className="chatgpt-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                    </svg>
                  </div>
                  <div className="bubble bubble-white">This is a great idea!</div>
                </div>
                <div className="chat-row" style={{ marginTop: 8 }}>
                  <div
                    className="bubble bubble-yellow bubble-rotated2"
                    style={{ marginLeft: 0 }}
                  >
                    Okay let&apos;s build it!
                  </div>
                </div>
              </div>
              <p className="pain-desc">
                Every idea is a great idea to ChatGPT. You need something that
                actually challenges you.
              </p>
            </div>
            <div className="pain-card reveal reveal-delay-2">
              <div className="pain-card-title">You don&apos;t know where to start</div>
              <div className="pain-bubbles">
                <div className="chat-row">
                  <div className="chatgpt-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                    </svg>
                  </div>
                  <div className="bubble bubble-white">Okay let&apos;s go</div>
                </div>
                <div className="chat-row" style={{ marginTop: 8 }}>
                  <div className="bubble bubble-yellow bubble-rotate-2">
                    Wait how do i start?
                  </div>
                </div>
              </div>
              <p className="pain-desc">
                ICP, pricing, distribution, competitors — it&apos;s overwhelming and
                nobody gives you a straight answer.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="how-section" id="how">
        <h2 className="section-title reveal">How it works ?</h2>
        <p className="section-sub reveal">
          From raw idea to verdict in 10 minutes.
        </p>
        <div className="steps-grid">
          <div className="step-card purple row-top reveal">
            <div className="step-pill">Step 1</div>
            <div className="step-text">
              <h3 className="step-title">Kill or Build</h3>
              <p className="step-desc">
                Drop your idea. Klayan analyzes real competitors, real market
                data, real distribution channels — and gives you a verdict. Not a
                score. A verdict.
              </p>
            </div>
          </div>
          <div className="step-card dark row-top reveal reveal-delay-1">
            <div className="step-pill">Step 2</div>
            <div className="step-text">
              <h3 className="step-title">Klayan researches live</h3>
              <p className="step-desc">
                Real competitors scraped today. Real customer complaints from
                Reddit and G2. Real market signals — not 2023 training data.
              </p>
            </div>
          </div>
          <div className="step-card dark row-bottom reveal reveal-delay-2">
            <div className="step-pill">Step 3</div>
            <div className="step-text">
              <h3 className="step-title">Get your verdict</h3>
              <p className="step-desc">
                Kill it. Flip it. Build it. With full evidence behind every
                decision. Not a score out of 10. A verdict.
              </p>
            </div>
          </div>
          <div className="step-card dark row-tall step-card-step4 reveal reveal-delay-3">
            <div className="step-pill">Step 4</div>
            <div className="step-card-step4-logo-wrap">
              <img
                src="https://i.ibb.co/rR3fVfcY/cardgif.gif"
                alt=""
                width={220}
                height="auto"
              />
            </div>
            <div className="step-card-step4-text-wrap">
              <div className="step-text">
                <h3 className="step-title">Execute the plan</h3>
                <p className="step-desc">
                  Exact people to contact. Exact messages to send. Daily roadmap
                  from idea to first paying customer.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="honest-section">
        <h2 className="honest-title reveal">This is what honest AI looks like</h2>
        <div className="terminal-wrap reveal">
          <div className="terminal-bar">
            <div className="t-dot t-dot-a" />
            <div className="t-dot t-dot-b" />
            <div className="t-dot t-dot-c" />
            <div className="t-title">klayan_analysis.log</div>
          </div>
          <div className="terminal-body">
            <div className="t-header">KLAYAN ANALYSIS — YOUR IDEA</div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">SITUATION</span>
            <div className="t-content">
              You built an AI SMS tool targeting marketing agencies. Weeks of
              outreach. Zero paying customers. End of March deadline.
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">HARD TRUTHS</span>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                01 — Your ICP is too broad. Marketing agencies is not a customer.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                02 — Market more saturated than you think. GHL already does this.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                03 — No clear distribution channel exists for this ICP.
              </span>
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">VERDICT</span>
            <div className="t-verdict">—— FLIP IT ——</div>
            <div className="t-content">
              Core insight is right. Market is wrong. Pivot to performance agencies
              running paid lead gen for local services.
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">NEXT 48 HOURS</span>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                01 — Search Facebook ads agency HVAC. DM 10 agencies today.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                02 — Run one free 2-week pilot. Document every number.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                03 — Rewrite pitch around ROI not features.
              </span>
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">THE QUESTION THAT MATTERS</span>
            <div className="t-highlight">
              Can you find one person who says that&apos;s exactly what kills us —
              not that&apos;s interesting? Find them in 48 hours.
            </div>
          </div>
        </div>
        <h2 className="honest-tagline reveal">Not a score. A verdict.</h2>
      </section>

      <section className="why-section">
        <div className="why-header reveal">
          <h2 className="why-title">
            6 reasons why Klayan is better than just asking ChatGPT.
          </h2>
          <p className="why-sub">
            ChatGPT is a tool. Klayan is a system built specifically for one thing
            — getting your idea to its first paying customer.
          </p>
        </div>
        <div className="reasons-grid">
          <div className="reason-item reveal">
            <div className="reason-num">1</div>
            <h3 className="reason-title">It tells you the truth.</h3>
            <p className="reason-desc">
              ChatGPT agrees with everything. Every idea is &quot;a great opportunity
              with strong potential.&quot; Klayan is designed to say no — with evidence
              behind every verdict.
            </p>
          </div>
          <div className="reason-item reveal reveal-delay-1">
            <div className="reason-num">2</div>
            <h3 className="reason-title">It uses live data.</h3>
            <p className="reason-desc">
              ChatGPT knows what it knew in 2023. Klayan searches the web right now
              — real competitors, real pricing, real customer complaints from Reddit
              and G2. Today. Not two years ago.
            </p>
          </div>
          <div className="reason-item reveal reveal-delay-2">
            <div className="reason-num">3</div>
            <h3 className="reason-title">It remembers your journey.</h3>
            <p className="reason-desc">
              Every conversation with ChatGPT starts from zero. Klayan remembers
              every idea, every pivot, every signal. Day 47 is smarter than Day 1
              because it knows your history.
            </p>
          </div>
          <div className="reason-item reveal">
            <div className="reason-num">4</div>
            <h3 className="reason-title">It asks the right questions.</h3>
            <p className="reason-desc">
              With ChatGPT you need to know what to ask. Most founders don&apos;t.
              Klayan runs a structured process — the same questions a real investor
              would ask before writing a check.
            </p>
          </div>
          <div className="reason-item reveal reveal-delay-1">
            <div className="reason-num">5</div>
            <h3 className="reason-title">It executes, not just advises.</h3>
            <p className="reason-desc">
              ChatGPT gives you text. Klayan gives you the 20 exact people to
              contact, the exact message to send, your landing page copy, your
              pricing, your 30-day launch plan.
            </p>
          </div>
          <div className="reason-item reveal reveal-delay-2">
            <div className="reason-num">6</div>
            <h3 className="reason-title">It stays with you.</h3>
            <p className="reason-desc">
              ChatGPT is a one-time conversation. Klayan follows you from raw idea
              to first paying customer — adapting as your signals come in, never
              starting over.
            </p>
          </div>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <p className="pricing-label reveal">Simple. Honest. Revenue-led.</p>
        <div className="pricing-grid reveal">
          <div className="pricing-card">
            <div className="pricing-card-name">Spark</div>
            <div className="pricing-price">$19/mo</div>
            {renderPricingCta("spark", false)}
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> 3 analyses per month
              </li>
              <li>
                <span className="feat-dot" /> Kill or Build verdict
              </li>
              <li>
                <span className="feat-dot" /> Market research &amp; competitor scan
              </li>
              <li>
                <span className="feat-dot" /> Hard Truths + Opportunity analysis
              </li>
              <li>
                <span className="feat-dot" /> Recommended Stack
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Signal Sprint
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Flip Engine
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Business Structure
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Revenue Roadmap
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Marketing Machine
              </li>
            </ul>
          </div>
          <div className="pricing-card featured">
            <div className="pricing-popular-badge">
              Most Popular!{" "}
              <img
                src="https://i.ibb.co/msYn5RH/navbarlogo.png"
                alt=""
                className="pricing-inline-logo"
              />
            </div>
            <div className="pricing-card-name">Build</div>
            <div className="pricing-price pricing-price-black">$69/mo</div>
            {renderPricingCta("build", true)}
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> 10 analyses per month
              </li>
              <li>
                <span className="feat-dot" /> Everything in Spark
              </li>
              <li>
                <span className="feat-dot" /> Signal Sprint (20 exact people to contact)
              </li>
              <li>
                <span className="feat-dot" /> Flip Engine (3 alternative business models)
              </li>
              <li>
                <span className="feat-dot" /> Business Structure recommendations
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Revenue Roadmap
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Marketing Machine
              </li>
            </ul>
          </div>
        </div>
        <div className="pricing-card scale reveal pricing-card-scale-max">
          <div className="pricing-card-name">Scale</div>
          <div className="scale-badge">
            Get the best out of Klayan!{" "}
            <img
              src="https://i.ibb.co/msYn5RH/navbarlogo.png"
              alt=""
              className="pricing-inline-logo"
            />
          </div>
          <div className="pricing-price">$149/mo</div>
          {renderPricingCta("scale", false)}
          <div className="pricing-divider pricing-divider-mt" />
          <ul className="pricing-features">
            <li>
              <span className="feat-dot" /> Unlimited analyses
            </li>
            <li>
              <span className="feat-dot" /> Everything in Build
            </li>
            <li>
              <span className="feat-dot" /> Revenue Roadmap (day by day to $10K MRR)
            </li>
            <li>
              <span className="feat-dot" /> Marketing Machine (landing page copy,
              outreach sequences, 30-day launch plan)
            </li>
            <li>
              <span className="feat-dot" /> Priority support
            </li>
          </ul>
        </div>
      </section>

      <section className="story-section">
        <div className="story-quote reveal">
          &quot;I spent months building products nobody wanted. Pivoting.
          Rebuilding. Pivoting again. One night I spent 3 hours with an AI that
          actually pushed back. Killed the bad ideas fast. Gave me a real plan.
          That conversation became Klayan. Every founder deserves that
          conversation.&quot;
        </div>
        <div className="story-author reveal">— Rayan, Founder of Klayan</div>
      </section>

      <section className="faq-section">
        <h2 className="faq-title reveal">Everything you need to know.</h2>
        <p className="faq-sub reveal">
          More questions? Book a call or email us at{" "}
          <a href="#" className="faq-email-link" onClick={(e) => e.preventDefault()}>
            [email&nbsp;protected]
          </a>
        </p>
        <div className="faq-list reveal">
          {[
            {
              q: "Is Klayan just another ChatGPT wrapper?",
              a: "No. Every other AI tool gives you generic advice from training data. Klayan pulls live data — real competitors, real market signals, real customer complaints from Reddit and G2 right now.",
            },
            {
              q: "How is this different from ValidatorAI or IdeaProof?",
              a: "Those tools give you a score out of 10 and wish you good luck. Klayan gives you a verdict with evidence, the exact people to contact, and a daily roadmap to first paying customer.",
            },
            {
              q: "Do I need to be technical to use Klayan?",
              a: "Zero technical knowledge required. You answer 7 questions. Klayan does the research, analysis, and planning. If you can type, you can use Klayan.",
            },
            {
              q: "What if my idea gets a Kill It verdict?",
              a: "That's the most valuable result you can get. Klayan doesn't just kill it — it shows you exactly why, and points you toward what to build instead. A kill verdict saves you 6 months.",
            },
            {
              q: "How does the Flip Engine work?",
              a: "When your initial model gets weak signals, Klayan generates 3 alternative versions of your business — different ICP, different pricing model, different distribution channel. With evidence behind each one.",
            },
          ].map((item, index) => (
            <div
              key={item.q}
              className={`faq-item${openFaqIndex === index ? " open" : ""}`}
            >
              <div
                className="faq-question"
                onClick={() => toggleFaq(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleFaq(index);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {item.q}
                <span className="faq-plus">+</span>
              </div>
              <div className="faq-answer">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <h2 className="cta-title reveal">
          Your next idea deserves more than a gut feeling.
        </h2>
        <p className="cta-sub reveal">
          Join founders who validate first and build second.
        </p>
        <a href="/analyze" className="cta-big-btn reveal">
          Analyze my Idea
        </a>
        <p className="cta-note reveal">
          Free to start · No credit card · Cancel anytime
        </p>
      </section>

      <footer>
        <div className="footer-copy">
          © 2026 Klayan — Built by founders, for founders.
        </div>
        <ul className="footer-links">
          <li>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Privacy
            </a>
          </li>
          <li>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Terms
            </a>
          </li>
          <li>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Contact
            </a>
          </li>
        </ul>
      </footer>

      <div id="klayanModal" className={modalOpen ? "is-open" : ""}>
        <div className="klayan-modal-panel">
          <button
            type="button"
            className="klayan-modal-close"
            onClick={closeModal}
            aria-label="Close"
          >
            ✕
          </button>
          <div id="modalProgressBar">
            <div
              id="modalProgress"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div id="modalContent" ref={modalContentRef}>
            <div id="qLabel">{q.label}</div>
            <div id="qText">{q.question}</div>
            <div id="qHint">{q.hint}</div>
            <textarea
              ref={inputRef}
              id="qInput"
              rows={4}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={q.placeholder}
            />
            <div id="qError" className={showInputError ? "is-visible" : ""}>
              ✕ Type something to continue
            </div>
            <div id="qCtrlHint">
              Press <span className="kbd">Ctrl</span> +{" "}
              <span className="kbd">Enter</span> to continue
            </div>
            <div className="klayan-modal-actions">
              <button
                type="button"
                id="qNext"
                onClick={() => void handleNext()}
                disabled={nextBusy}
                style={{ opacity: nextBusy ? 0.6 : 1 }}
              >
                {nextLabel}
              </button>
              <button
                type="button"
                id="qBack"
                className={current > 0 ? "is-visible" : ""}
                onClick={handlePrev}
              >
                ↑ BACK
              </button>
            </div>
          </div>
          <div id="modalFooter">
            <span id="qCounter">
              {current + 1} of {totalQ} questions
            </span>
            <div id="qDots">
              {Array.from({ length: totalQ }, (_, i) => (
                <div
                  key={i}
                  className={
                    "modal-dot " +
                    (i === current ? "active" : i < current ? "done" : "todo")
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="klayanSuccess" className={successOpen ? "is-open" : ""}>
        <img
          src="https://i.ibb.co/rR3fVfcY/cardgif.gif"
          alt=""
          className="klayan-success-gif"
        />
        <h2 className="klayan-success-title">We&apos;re on it.</h2>
        <p className="klayan-success-text">
          Your verdict will be in your inbox within 24 hours. We&apos;re running a
          full Kill or Build analysis on your idea right now.
        </p>
        <button
          type="button"
          className="klayan-success-btn"
          onClick={closeModal}
        >
          Back to Klayan
        </button>
      </div>
    </>
  );
}
