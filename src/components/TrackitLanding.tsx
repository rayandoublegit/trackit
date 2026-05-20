"use client";

import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

export default function TrackitLanding() {
  const heroDoodleRef = useRef<HTMLImageElement>(null);
  const heroCursorRef = useRef<HTMLImageElement>(null);
  const heroMoneyRef = useRef<HTMLImageElement>(null);
  const [basicAnnual, setBasicAnnual] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(".fade-up").forEach((el) => {
      if (el.closest("#painContainer")) return;
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const revealHero = () => {
      document.querySelectorAll(".hero .fade-up").forEach((el) => {
        setTimeout(() => el.classList.add("visible"), 100);
      });
    };
    if (document.readyState === "complete") revealHero();
    else window.addEventListener("load", revealHero);
    return () => window.removeEventListener("load", revealHero);
  }, []);

  useEffect(() => {
    const heroDoodle = heroDoodleRef.current;
    const heroCursor = heroCursorRef.current;
    const heroMoney = heroMoneyRef.current;

    const onScroll = () => {
      const scrollY = window.scrollY;
      if (heroDoodle) {
        heroDoodle.style.transform = `rotate(-5deg) translateY(${-scrollY * 0.35}px)`;
      }
      if (heroCursor) {
        heroCursor.style.transform = `translateY(${-scrollY * 0.5}px)`;
      }
      if (heroMoney) {
        heroMoney.style.transform = `rotate(-10deg) translateY(${-scrollY * 0.45}px)`;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="relative min-h-screen w-full">
      {/* NAVBAR */}
      <nav className="navbar">
        <Link
          href="/"
          className="nav-logo"
          aria-label="Trackit home"
          onClick={(e) => {
            if (window.location.pathname === "/") {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        >
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" />
        </Link>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#process">Process</a>
          <a href="#features">Trackit</a>
        </div>
        <a href="/auth" className="nav-cta">
          Open thentrack.it
        </a>
      </nav>

      {/* HERO */}
      <section className="hero">
        <img
          ref={heroDoodleRef}
          src="https://i.ibb.co/20jgns98/navbarlogotransparent.png"
          className="hero-doodle"
          alt=""
        />
        <img
          ref={heroCursorRef}
          src="https://i.ibb.co/G4SvBCXp/cursortransparent.png"
          className="hero-cursor"
          alt=""
        />
        <img
          ref={heroMoneyRef}
          src="https://i.ibb.co/ZznDLJMC/moneytransparent.png"
          className="hero-money"
          alt=""
        />
        <h1 className="hero-headline">
          <span className="hero-line-wrap fade-up">Find creators.</span>
          <span className="hero-line-wrap fade-up fade-up-delay-1">Track sales.</span>
          <span className="hero-line-wrap fade-up fade-up-delay-2">Pay commissions.</span>
          <span
            className={`hero-italic fade-up fade-up-delay-3 ${instrumentSerif.className}`}
          >
            All in one place.
          </span>
        </h1>

        <p className="hero-sub fade-up fade-up-delay-4">
          &quot;Stop spending hours searching TikTok manually. Trackit finds the right creators for your
          brand, tracks every sale they drive, and pays commissions automatically. No spreadsheets. No
          $300/month enterprise tools.
        </p>

        <a href="/auth" className="hero-cta fade-up fade-up-delay-5">
          Get started for Free
        </a>

        <div className="hero-badges fade-up fade-up-delay-5">
          <div className="badge">
            <span className="badge-text">
              Commission Tracking
              <br />
              Automated
            </span>
          </div>
          <div className="badge">
            <span className="badge-text">
              $0 Manual Bank
              <br />
              Transfers
            </span>
          </div>
        </div>
        <p className="hero-trusted fade-up fade-up-delay-5">
          Trusted by over 2,000 of the best Shopify Stores
        </p>
      </section>

      {/* PAIN POINTS */}
      <section className="pain-points-stack" id="painContainer">
        <div className="pain-point-card" style={{ top: "0px" }}>
          <div className="pain-row">
            <div className="pain-text">
              <h2 className="pain-title">
                You&apos;ve been doing
                <br />
                this the hard way.
              </h2>
              <p className="pain-sub">
                You scroll TikTok and Instagram for hours trying to find creators who actually fit your
                brand. Most tools give you a giant useless database.
              </p>
            </div>
            <div className="pain-image">
              <img src="https://i.ibb.co/Xf5f2ZMk/painimage2.jpg" alt="TikTok scrolling" />
            </div>
          </div>
        </div>
        <div className="pain-point-card" style={{ top: "0px" }}>
          <div className="pain-row">
            <div className="pain-text">
              <h2 className="pain-title">
                Commissions tracked
                <br />
                in spreadsheets.
              </h2>
              <p className="pain-sub">
                Every month you manually calculate who earned what and send individual PayPal transfers. It
                takes a full day and you still make mistakes.
              </p>
            </div>
            <div className="pain-image">
              <img src="https://i.ibb.co/fVCDDDqV/painimage1.jpg" alt="Spreadsheets" />
            </div>
          </div>
        </div>
        <div className="pain-point-card" style={{ top: "0px" }}>
          <div className="pain-row">
            <div className="pain-text">
              <h2 className="pain-title">
                Enterprise tools
                <br />
                you can&apos;t afford.
              </h2>
              <p className="pain-sub">
                Modash is $299/month. Aspire is $500/month. You&apos;re a lean brand. You just need
                something that works without breaking the bank.
              </p>
            </div>
            <div className="pain-image" style={{ overflow: "visible", borderRadius: "16px" }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "9px",
                  overflow: "hidden",
                  background: "#fafafa",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  padding: "20px 0 20px 20px",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    background: "#f0f0f0",
                    borderRadius: "10px",
                    padding: "18px",
                    width: "60%",
                    fontFamily: "InterDisplay, sans-serif",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Essentials</div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#666",
                      lineHeight: 1.4,
                      marginBottom: "16px",
                    }}
                  >
                    Pour les campagnes avec jusqu&apos;à 100 créateurs.
                    <br />
                    Validez le marketing d&apos;influence avant de passer à l&apos;échelle.
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px" }}>
                    $199 <span style={{ fontSize: "10px", fontWeight: 400, color: "#888" }}>Mensuel</span>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: "#000",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      fontSize: "10px",
                      width: "100%",
                      fontFamily: "InterDisplay, sans-serif",
                    }}
                  >
                    Essayez gratuitement
                  </button>
                </div>
                <div
                  style={{
                    background: "#f0f0f0",
                    borderRadius: "10px",
                    padding: "18px",
                    width: "50%",
                    fontFamily: "InterDisplay, sans-serif",
                    transform: "translateX(-10%)",
                  }}
                >
                  <div style={{ fontSize: "10px", color: "#999", marginBottom: "4px" }}>Recommended</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Performance</div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#666",
                      lineHeight: 1.4,
                      marginBottom: "16px",
                    }}
                  >
                    For campaigns.
                    <br />
                    Scale your performance.
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700 }}>$499</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRACKIT SECTION */}
      <section className="section" id="features">
        <div className="tagline fade-up">
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /> Trackit
        </div>
        <h2 className="section-title fade-up fade-up-delay-1">
          Trackit does everything.
          <br />
          In one place.
        </h2>
        <p className="section-sub fade-up fade-up-delay-2">
          From finding the perfect creator to paying their commission automatically. Built for Shopify
          brands who are serious about creator marketing.
        </p>

        <div className="dashboard-wrap fade-up fade-up-delay-3">
          <img src="https://i.ibb.co/ycz3grqZ/trackitimage.jpg" alt="Trackit dashboard" />
        </div>

        <div className="features-grid">
          <div className="feature fade-up">
            <div className="feature-title">
              <span className="feature-icon-wrapper">
                <svg
                  className="feature-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="12" cy="12" r="9" stroke="black" strokeWidth="1.6" />
                  <ellipse cx="12" cy="12" rx="4" ry="9" stroke="black" strokeWidth="1.6" />
                  <line x1="3" y1="12" x2="21" y2="12" stroke="black" strokeWidth="1.6" />
                </svg>
              </span>
              Smart Creator Discovery
            </div>
            <div className="feature-desc">
              Search 250M+ creators across TikTok, Instagram, and YouTube. Filter by niche, engagement
              rate, follower count, and location. Find creators whose audience is exactly your customer.
            </div>
          </div>
          <div className="feature fade-up fade-up-delay-1">
            <div className="feature-title">
              <span className="feature-icon-wrapper">
                <svg
                  className="feature-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
                    stroke="black"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </span>
              AI Outreach Generation
            </div>
            <div className="feature-desc">
              Stop sending generic copy-paste DMs. Trackit generates a personalized outreach message for
              every creator based on their content style and your product. Higher response rates. Less
              work.
            </div>
          </div>
          <div className="feature fade-up fade-up-delay-2">
            <div className="feature-title">
              <span className="feature-icon-wrapper">
                <svg
                  className="feature-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <line x1="12" y1="3" x2="12" y2="6" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="12" y1="18" x2="12" y2="21" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="3" y1="12" x2="6" y2="12" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="18" y1="12" x2="21" y2="12" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="5.6" y1="5.6" x2="7.7" y2="7.7" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line
                    x1="16.3"
                    y1="16.3"
                    x2="18.4"
                    y2="18.4"
                    stroke="black"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="5.6"
                    y1="18.4"
                    x2="7.7"
                    y2="16.3"
                    stroke="black"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="16.3"
                    y1="7.7"
                    x2="18.4"
                    y2="5.6"
                    stroke="black"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              Automatic Sale Tracking
            </div>
            <div className="feature-desc">
              Connect your Shopify store. Every creator gets a unique tracking link or discount code.
              Every sale attributed automatically in real time. No manual tracking. No guessing.
            </div>
          </div>
          <div className="feature fade-up fade-up-delay-3">
            <div className="feature-title">
              <span className="feature-icon-wrapper">
                <svg
                  className="feature-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M8 4v16M8 20l-3-3M8 20l3-3"
                    stroke="black"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 20V4M16 4l-3 3M16 4l3 3"
                    stroke="black"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              One Click Commission Payouts
            </div>
            <div className="feature-desc">
              See exactly what every creator earned. Hit send. Money goes directly to their account. No
              bank transfers. No PayPal drama. No spreadsheet math.
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="section" id="process">
        <div className="tagline fade-up">⇄ Process</div>
        <h2 className="section-title fade-up fade-up-delay-1">
          From zero to first creator
          <br />
          campaign in 10 minutes.
        </h2>
        <p className="section-sub fade-up fade-up-delay-2">
          Four simple steps. No agency. No enterprise contract. No complexity.
        </p>

        <div className="process-grid">
          <div className="process-card fade-up">
            <div className="process-mockup">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '14px',
                  marginBottom: '12px',
                  background: 'transparent'
                }}>
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '999px',
                    padding: '6px 18px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#000000',
                    fontFamily: "'InterDisplay', sans-serif",
                    letterSpacing: '-0.3px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}>Desktop</div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#9A9A9A',
                    fontFamily: "'InterDisplay', sans-serif",
                    letterSpacing: '-0.3px',
                    padding: '6px 4px'
                  }}>Tablet</div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#9A9A9A',
                    fontFamily: "'InterDisplay', sans-serif",
                    letterSpacing: '-0.3px',
                    padding: '6px 4px'
                  }}>Mobile</div>
                </div>
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #E8E8E8',
                  overflow: 'hidden',
                  width: '100%',
                  margin: '0 auto',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                  maskImage: 'linear-gradient(to bottom, black 35%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 35%, transparent 100%)',
                  transform: 'scale(0.95)',
                  transformOrigin: 'top center',
                  marginTop: '40px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderBottom: '1px solid #F0F0F0',
                    background: '#FAFAFA'
                  }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E0E0E0' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E0E0E0' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E0E0E0' }} />
                    </div>
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#F5F5F5',
                      border: '1px solid #EEEEEE',
                      borderRadius: '8px',
                      padding: '3px 10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="12" height="12" viewBox="0 0 50 57" xmlns="http://www.w3.org/2000/svg">
                          <path d="M28.3 5.9c0 0-0.7 0.2-1.8 0.5c-0.1-0.4-0.3-0.9-0.6-1.4c-0.9-1.7-2.2-2.6-3.8-2.6c-0.1 0-0.2 0-0.4 0C21.5 2.1 21.2 1.8 20.8 1.6C19.4 0.6 17.7 1 16.3 2.1C12 5.5 10 13 9.4 17.1C7 17.8 5.3 18.4 5.2 18.4C3.8 18.8 3.8 18.9 3.6 20.2C3.5 21.1 0 47.5 0 47.5L33.9 53l7.3-1.8L28.3 5.9z" fill="#95BF47"/>
                          <path d="M35.1 10.7c-0.7 0-1.5 0.2-1.5 0.2s-0.8-2.5-2.3-3.5c-0.7-0.5-1.5-0.6-2.3-0.4l6.1 44.8l7.3-1.8c0 0-5.9-37.4-6-38.2C36.3 11.1 35.8 10.7 35.1 10.7z" fill="#5E8E3E"/>
                          <path d="M25.2 19.6l-1.5 5.7c0 0-1.7-0.8-3.7-0.7c-3 0.2-3 2.1-3 2.5c0.2 2.8 7.5 3.4 7.9 10c0.3 5.2-2.7 8.7-7.1 9c-5.3 0.3-7.9-2.8-7.9-2.8l1.1-4.6c0 0 2.7 2 4.8 1.9c1.4-0.1 1.9-1.2 1.9-2c-0.2-3.7-6.2-3.4-6.5-9.5C10.8 23.6 14.7 18 22 17.5C24.9 17.3 25.2 19.6 25.2 19.6z" fill="white"/>
                        </svg>
                        <span style={{
                          color: '#888',
                          fontWeight: 400,
                          fontSize: '11px',
                          lineHeight: '11px',
                          letterSpacing: '-0.4px',
                          fontFamily: "'InterDisplay', sans-serif"
                        }}>Shopify.com</span>
                      </div>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="#BBB" strokeWidth="1.6"/>
                        <ellipse cx="12" cy="12" rx="4" ry="9" stroke="#BBB" strokeWidth="1.6"/>
                        <line x1="3" y1="12" x2="21" y2="12" stroke="#BBB" strokeWidth="1.6"/>
                      </svg>
                    </div>
                  </div>
                  <div style={{ padding: '14px', background: '#FFFFFF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1px', marginLeft: '36px' }}>
                        <svg width="18" height="18" viewBox="0 0 50 57" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '-2px' }}>
                          <path d="M28.3 5.9c0 0-0.7 0.2-1.8 0.5c-0.1-0.4-0.3-0.9-0.6-1.4c-0.9-1.7-2.2-2.6-3.8-2.6c-0.1 0-0.2 0-0.4 0C21.5 2.1 21.2 1.8 20.8 1.6C19.4 0.6 17.7 1 16.3 2.1C12 5.5 10 13 9.4 17.1C7 17.8 5.3 18.4 5.2 18.4C3.8 18.8 3.8 18.9 3.6 20.2C3.5 21.1 0 47.5 0 47.5L33.9 53l7.3-1.8L28.3 5.9z" fill="#95BF47"/>
                          <path d="M35.1 10.7c-0.7 0-1.5 0.2-1.5 0.2s-0.8-2.5-2.3-3.5c-0.7-0.5-1.5-0.6-2.3-0.4l6.1 44.8l7.3-1.8c0 0-5.9-37.4-6-38.2C36.3 11.1 35.8 10.7 35.1 10.7z" fill="#5E8E3E"/>
                          <path d="M25.2 19.6l-1.5 5.7c0 0-1.7-0.8-3.7-0.7c-3 0.2-3 2.1-3 2.5c0.2 2.8 7.5 3.4 7.9 10c0.3 5.2-2.7 8.7-7.1 9c-5.3 0.3-7.9-2.8-7.9-2.8l1.1-4.6c0 0 2.7 2 4.8 1.9c1.4-0.1 1.9-1.2 1.9-2c-0.2-3.7-6.2-3.4-6.5-9.5C10.8 23.6 14.7 18 22 17.5C24.9 17.3 25.2 19.6 25.2 19.6z" fill="white"/>
                        </svg>
                        <span style={{
                          fontWeight: 600,
                          fontSize: '10px',
                          lineHeight: '10px',
                          letterSpacing: '-0.04em',
                          color: '#1A1A1A',
                          fontFamily: "'InterDisplay', sans-serif"
                        }}>Shopify</span>
                      </div>
                      <div style={{ width: '40px', height: '14px', background: '#EEE', borderRadius: '20px', marginRight: '12px' }} />
                    </div>
                    <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: '13px',
                        color: '#000',
                        lineHeight: '11px',
                        letterSpacing: '-0.04em',
                        fontFamily: "'InterDisplay', sans-serif",
                        marginBottom: '14px'
                      }}>
                        Start an online<br />store for free
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '180px', height: '8px', background: '#EEE', borderRadius: '4px' }} />
                        <div style={{ width: '140px', height: '8px', background: '#EEE', borderRadius: '4px' }} />
                        <div style={{ width: '60px', height: '8px', background: '#EEE', borderRadius: '4px', marginTop: '4px' }} />
                      </div>
                    </div>
                    <div style={{ height: '80px', background: '#EEEEEE', borderRadius: '8px' }} />
                  </div>
                </div>
              </div>

            </div>
            <div className="process-card-title" style={{ marginTop: '-112px', paddingLeft: '0px' }}>
              <span className="process-icon" aria-hidden="true">
                ⊕
              </span>
              Connect your Shopify store.
            </div>
            <div className="process-card-desc" style={{ marginTop: '4px', paddingLeft: '8px' }}>60 seconds. One click. Done.</div>
          </div>

          <div className="process-card fade-up fade-up-delay-1">
            <div className="process-mockup">
              <div className="inf-card" style={{ marginTop: '60px' }}>
                <div className="inf-header">
                  <div className="inf-title">Influencers found :</div>
                  <div className="inf-filters">
                    <div className="f">1d</div>
                    <div className="f">7d</div>
                    <div className="f">1m</div>
                    <div className="f">6m</div>
                    <div className="f active">All</div>
                    <div className="f">📅</div>
                  </div>
                </div>
                <div className="inf-count">
                  <div className="inf-num">24</div>
                  <div className="inf-avatars">
                    <div className="av" />
                    <div className="av" />
                    <div className="av" />
                  </div>
                </div>
                <div className="inf-btn">Reach out →</div>
                <br />
                <div className="inf-btn">See Profiles →</div>
              </div>
            </div>
            <div className="process-card-title">⛶ Find creators in your niche.</div>
            <div className="process-card-desc">
              Filter by platform, engagement, location, and audience size.
            </div>
          </div>

          <div className="process-card fade-up fade-up-delay-2">
            <div className="process-mockup">
              <div className="outreach-wrap" style={{ marginTop: '12px' }}>
                <div className="outreach-stack">
                  <div className="outreach-msg outreach-msg-3">
                    <div className="outreach-logo">
                      <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
                    </div>
                    <div className="outreach-text">&quot;Are you interested in a...&quot;</div>
                  </div>
                  <div className="outreach-msg outreach-msg-2">
                    <div className="outreach-logo">
                      <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
                    </div>
                    <div className="outreach-text">&quot;I reach to you because...&quot;</div>
                  </div>
                  <div className="outreach-msg outreach-msg-1">
                    <div className="outreach-logo">
                      <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
                    </div>
                    <div className="outreach-text">&quot;Hey seen your posts...&quot;</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="process-card-title">
              <svg
                className="process-icon"
                width="14"
                height="14"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="14" cy="14" r="14" fill="black" />
                <path
                  d="M14 6C9.582 6 6 9.328 6 13.444c0 2.16.9 4.1 2.364 5.49V22l2.854-1.41C12.014 20.85 12.99 21 14 21c4.418 0 8-3.328 8-7.556C22 9.328 18.418 6 14 6z"
                  fill="black"
                />
                <path
                  d="M14 6C9.582 6 6 9.328 6 13.444c0 2.16.9 4.1 2.364 5.49V22l2.854-1.41C12.014 20.85 12.99 21 14 21c4.418 0 8-3.328 8-7.556C22 9.328 18.418 6 14 6z"
                  fill="white"
                  fillOpacity="0"
                />
                <path
                  d="M10 15.5l2.5-2.7 2.3 2.2 3.2-2.5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Send AI personalized outreach.
            </div>
            <div className="process-card-desc">One click. Message generated. Ready to send.</div>
          </div>

          <div className="process-card fade-up fade-up-delay-3">
            <div className="process-mockup">
              <div className="pay-grid">
                <div className="pay-cell e" />
                <div className="pay-cell e" />
                <div className="pay-cell">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg"
                    alt="PayPal"
                  />
                </div>
                <div className="pay-cell">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
                    alt="Mastercard"
                  />
                </div>
                <div className="pay-cell e" />
                <div className="pay-cell">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/f/f2/Google_Pay_Logo.svg"
                    alt="Google Pay"
                  />
                </div>
                <div className="pay-cell e" />
                <div className="pay-cell d">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg"
                    alt="Stripe"
                  />
                </div>
                <div className="pay-cell e" />
                <div className="pay-cell e" />
                <div className="pay-cell e" />
                <div className="pay-cell d">
                  <img
                    className="pay-logo pay-logo-apple"
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Apple_Pay_logo.svg"
                    alt="Apple Pay"
                  />
                </div>
              </div>
            </div>
            <div className="process-card-title">
              <svg
                className="process-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" fill="black" />
                <polyline
                  points="5,15 9,10 13,13 18,7"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <polyline
                  points="5,18 19,18"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Track sales and pay commissions.
            </div>
            <div className="process-card-desc">Every sale tracked. Every commission paid automatically.</div>
          </div>
        </div>
      </section>

      {/* WHY TRACKIT */}
      <section className="section" id="why">
        <div className="why-intro">
          <div className="tagline fade-up">
            <span className="tagline-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4v.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <circle cx="12" cy="18" r="1.3" fill="white"/>
              </svg>
            </span>
            Why Trackit
          </div>
          <h2 className="section-title fade-up fade-up-delay-1">
            Built for brands like yours.
            <br />
            Not for enterprise.
          </h2>
          <p className="section-sub fade-up fade-up-delay-2">
            Every other tool was built for agencies with 10 people and $500/month budgets. Trackit was
            built for lean Shopify brands who need results not complexity.
          </p>
        </div>

        <div className="why-grid">
          <div className="why-col fade-up fade-up-delay-3">
            <h3>
              Traditional
              <br />
              Platforms
            </h3>
            <ul className="why-list">
              {[
                "Creator discovery",
                "AI outreach generation",
                "Shopify integration",
                "Automatic sale tracking",
                "One click payouts",
                "Fair price",
                "Built for small brands",
                "8-hour data delays",
                "Cost spikes at scale",
                "Fragmented data lakes",
              ].map((t) => (
                <li key={t}>
                  <span className="wcheck">
                    <svg viewBox="0 0 10 10">
                      <path d="M2 5 L4 7 L8 3" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="why-col right fade-up fade-up-delay-4">
            <h3>Trackit</h3>
            <ul className="why-list">
              {[
                "Real-time profit mapping",
                "Unlimited event processing",
                "Transparent AI reasoning",
                "Auto-optimized segments",
                "Privacy-first identity stitching",
                "Collaborative analytics playground",
                "AI-powered bot filtering",
                "Live margin tracking",
                "Usage-based scaling",
                "Unified data lakehouse",
              ].map((t) => (
                <li key={t}>
                  <span className="wcheck">
                    <svg viewBox="0 0 10 10">
                      <path d="M2 5 L4 7 L8 3" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div className="tagline fade-up">
          <span className="tagline-icon tagline-icon-jar">
            <svg width="18" height="20" viewBox="0 0 24 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="6" y1="2.5" x2="18" y2="2.5" stroke="#0047FF" strokeWidth="2.4" strokeLinecap="round"/>
              <line x1="6" y1="6.5" x2="18" y2="6.5" stroke="#0047FF" strokeWidth="2.4" strokeLinecap="round"/>
              <rect x="3" y="9" width="18" height="15" rx="2.5" fill="#0047FF"/>
            </svg>
          </span>
          Pricing
        </div>
        <h2 className="section-title fade-up fade-up-delay-1">Simple pricing. No surprises.</h2>
        <p className="section-sub fade-up fade-up-delay-2">
          Start free. Upgrade when you&apos;re ready. Cancel anytime. No hidden fees. No annual contracts
          forced on you.
        </p>

        <div className="pricing-grid">
          <div className="pricing-wrap fade-up fade-up-delay-3">
            <div className="pricing-toggle">
              <div className="pricing-toggle-left">
                <button
                  type="button"
                  className={`toggle-switch${basicAnnual ? " is-on" : ""}`}
                  aria-label="Toggle billing"
                  aria-pressed={basicAnnual}
                  onClick={() => setBasicAnnual((on) => !on)}
                >
                  <span className="toggle-thumb"></span>
                </button>
                <span className="toggle-label">Annually</span>
              </div>
              <div className="pricing-toggle-pill">Save 20% with annual billing</div>
            </div>
            <div className="pricing-card">
              <div className="pricing-card-top">
                <div className="pricing-logo"><img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /></div>
                <div className="pricing-name">Basic</div>
                <div className="pricing-desc">For brands running serious creator campaigns.</div>
                <div className="pricing-price">
                  <span className="pricing-amount">{basicAnnual ? "$499" : "$49"}</span>
                  <span className="pricing-period">/month</span>
                </div>
              </div>
              <div className="pricing-divider"></div>
              <div className="pricing-features">
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Unlimited creator searches</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>AI personalized outreach</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Unlimited Shopify stores</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Automatic sale tracking</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>One click payouts</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Priority support</div>
              </div>
              <a href="#" className="pricing-cta">Get Started</a>
            </div>
          </div>

          <div className="pricing-wrap fade-up fade-up-delay-4">
            <div className="pricing-toggle">
              <div className="pricing-toggle-left">
                <button
                  type="button"
                  className={`toggle-switch${proAnnual ? " is-on" : ""}`}
                  aria-label="Toggle billing"
                  aria-pressed={proAnnual}
                  onClick={() => setProAnnual((on) => !on)}
                >
                  <span className="toggle-thumb"></span>
                </button>
                <span className="toggle-label">Annually</span>
              </div>
              <div className="pricing-toggle-pill">Priority support</div>
            </div>
            <div className="pricing-card">
              <div className="pricing-card-top">
                <div className="pricing-logo"><img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /></div>
                <div className="pricing-name">Pro</div>
                <div className="pricing-desc">For founders running distribution campaigns at scale.</div>
                <div className="pricing-price">
                  <span className="pricing-amount">{proAnnual ? "$1190" : "$119"}</span>
                  <span className="pricing-period">/month</span>
                </div>
              </div>
              <div className="pricing-divider"></div>
              <div className="pricing-features">
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Everything in Basic, plus:</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Team access</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>White label reports</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Bulk outreach export</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Unlimited Shopify stores</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Daily offers on pricing</div>
              </div>
              <a href="#" className="pricing-cta pricing-cta-dark">Get Started</a>
            </div>
          </div>

          <div className="pricing-wrap pricing-wrap-full fade-up fade-up-delay-5">
            <div className="pricing-toggle">
              <div className="pricing-toggle-left">
                <button type="button" className="toggle-switch" aria-label="Toggle billing" disabled>
                  <span className="toggle-thumb"></span>
                </button>
                <span className="toggle-label">Annually</span>
              </div>
            </div>
            <div className="pricing-card">
              <div className="pricing-card-top">
                <div className="pricing-logo"><img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /></div>
                <div className="pricing-name">Free</div>
                <div className="pricing-desc">Get started with no commitment.</div>
                <div className="pricing-price">
                  <span className="pricing-amount">$0</span>
                  <span className="pricing-period">/month</span>
                </div>
              </div>
              <div className="pricing-divider"></div>
              <div className="pricing-features">
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>5 creator searches per day</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Basic outreach templates</div>
                <div className="pricing-feature"><svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>1 Shopify store</div>
              </div>
              <a href="#" className="pricing-cta">Start free →</a>
            </div>
          </div>
        </div>

      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
              <span className="footer-name">Trackit.</span>
            </div>
            <div className="footer-tag">A Platform made by e-com founders to e-com founders</div>
          </div>
          <div className="footer-socials">
            <a href="#" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
            </a>
            <a href="#" aria-label="X">
              <svg viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="#" aria-label="YouTube">
              <svg viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
            <a href="#" aria-label="Reddit">
              <svg viewBox="0 0 24 24">
                <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.32.143 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65z" />
              </svg>
            </a>
            <a href="#" aria-label="Facebook">
              <svg viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a href="#" aria-label="WhatsApp">
              <svg viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
              </svg>
            </a>
            <a href="#" aria-label="TikTok">
              <svg viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1Z" />
              </svg>
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <div>Copyright © Trackit.Inc All rights reserved</div>
          <div className="footer-links">
            <a href="#">Terms &amp; Conditions</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
