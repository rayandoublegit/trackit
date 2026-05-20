"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CALENDLY_URL = "https://calendly.com/trackit/15min";
const SUPPORT_EMAIL = "support@trackit.app";

const btnBlack: React.CSSProperties = {
  background: "#1A1A1A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const btnSecondary: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const GUIDES = [
  {
    id: "shopify",
    icon: "🔗",
    title: "Connect your Shopify store",
    text: "Link your store in 60 seconds to start tracking creator sales automatically.",
    tag: "5 min read",
  },
  {
    id: "discovery",
    icon: "🔍",
    title: "Find your first creators",
    text: "Learn how to search and filter creators that match your brand perfectly.",
    tag: "3 min read",
  },
  {
    id: "outreach",
    icon: "✉️",
    title: "Send your first outreach",
    text: "Use Trackit AI to generate personalized messages that actually get replies.",
    tag: "4 min read",
  },
  {
    id: "commission",
    icon: "💸",
    title: "Set up commission tracking",
    text: "Automate commission calculation and payouts for every creator partner.",
    tag: "6 min read",
  },
  {
    id: "analytics",
    icon: "📊",
    title: "Read your analytics",
    text: "Understand which creators drive the most revenue and why.",
    tag: "4 min read",
  },
];

type GuideBlock =
  | { type: "intro"; text: string }
  | { type: "section"; title: string; text: string }
  | { type: "step"; number: number; title: string; text: string; tip?: string }
  | { type: "callout"; text: string; variant: "tip" | "pro" | "action" | "troubleshoot" };

const GUIDE_CONTENT: Record<string, { title: string; readTime: string; blocks: GuideBlock[] }> = {
  shopify: {
    title: "Connect your Shopify store",
    readTime: "5 min read",
    blocks: [
      {
        type: "intro",
        text: "Connecting your Shopify store is the foundation of Trackit. Once connected, every sale driven by your creators is tracked automatically — no spreadsheets, no manual work.",
      },
      {
        type: "step",
        number: 1,
        title: "Go to Integrations",
        text: "Navigate to Integrations in the left sidebar. You'll see the Shopify card at the top of the page.",
        tip: "💡 Tip: You can connect multiple Shopify stores on the Pro and Agency plans.",
      },
      {
        type: "step",
        number: 2,
        title: "Enter your store URL",
        text: "Click Connect Shopify. Enter your store URL in the format: yourstore.myshopify.com — do not include https://",
      },
      {
        type: "step",
        number: 3,
        title: "Authorize Trackit",
        text: "You'll be redirected to Shopify to approve the connection. Trackit only requests read access to orders and the ability to create discount codes. We never touch your products or customer data.",
      },
      {
        type: "step",
        number: 4,
        title: "Confirm connection",
        text: "Once authorized you'll be redirected back to Trackit. Your store will show as Connected with a green badge.",
      },
      {
        type: "section",
        title: "What happens next",
        text: "Trackit will now listen for new orders. When a customer checks out using a creator's discount code or referral link, the sale appears in your Payouts dashboard in real time.",
      },
      {
        type: "callout",
        variant: "troubleshoot",
        text: "Store not connecting? Make sure you're using the .myshopify.com format, not your custom domain. Still stuck? Chat with us.",
      },
    ],
  },
  discovery: {
    title: "Find your first creators",
    readTime: "3 min read",
    blocks: [
      {
        type: "intro",
        text: "Discovery is where you find creators whose audience perfectly matches your customers. The goal is not the biggest creators — it's the right creators.",
      },
      {
        type: "section",
        title: "What makes a good creator match",
        text: "Three things matter more than follower count: engagement rate above 3%, audience demographics that match your ICP, and content style that fits your brand naturally.",
      },
      { type: "step", number: 1, title: "Open Discovery", text: "Click Discovery in the left sidebar. You'll see the search bar and filters." },
      {
        type: "step",
        number: 2,
        title: "Choose your platform",
        text: "Start with TikTok for ecommerce brands. TikTok drives the highest purchase intent of any platform right now. Instagram is better for lifestyle and beauty. YouTube for high-ticket products that need explanation.",
      },
      {
        type: "step",
        number: 3,
        title: "Enter your niche",
        text: "Be specific. Don't search 'fashion' — search 'sustainable fashion France' or 'streetwear Paris'. Specific niches return creators whose audience is genuinely interested in what you sell.",
      },
      {
        type: "step",
        number: 4,
        title: "Filter by engagement",
        text: "Set minimum engagement rate to 3%. Ignore follower count for now. A creator with 10K followers and 8% engagement will drive more sales than one with 500K followers and 0.5% engagement.",
      },
      {
        type: "step",
        number: 5,
        title: "Save your best finds",
        text: "Click Save creator on any card to add them to your saved list. Build a shortlist of 10-20 before you start outreach.",
      },
      {
        type: "callout",
        variant: "pro",
        text: "💡 The best creators are often between 10K-100K followers. They're affordable, have highly engaged audiences, and are more likely to respond to outreach from smaller brands.",
      },
    ],
  },
  outreach: {
    title: "Send your first outreach",
    readTime: "4 min read",
    blocks: [
      {
        type: "intro",
        text: "Most creator outreach fails because it's generic. Trackit AI reads the creator's profile and writes a message that feels personal — because it is.",
      },
      {
        type: "section",
        title: "Why generic messages don't work",
        text: "Creators get hundreds of DMs every week. 'Hey I love your content, want to collab?' gets ignored every time. The messages that get replies are specific, short, and lead with value not ask.",
      },
      {
        type: "step", number: 1, title: "Select a creator", text: "Go to your saved creators or click Generate outreach on any creator card in Discovery.",
      },
      {
        type: "step",
        number: 2,
        title: "Describe your brand",
        text: "Enter what you sell in one sentence. Be specific: 'sustainable activewear for women in France' not just 'clothing brand'.",
      },
      {
        type: "step",
        number: 3,
        title: "Choose your tone",
        text: "Casual works best for TikTok creators under 100K followers. Professional for YouTube creators. Match the energy of their content.",
      },
      {
        type: "step",
        number: 4,
        title: "Generate and review",
        text: "Click Generate. Read the message carefully. Edit anything that doesn't sound like you. Add a specific reference to one of their recent posts for best results.",
      },
      {
        type: "step",
        number: 5,
        title: "Send and track",
        text: "Copy the message. Send it on the platform. Come back to Outreach and mark it as sent. Trackit will remind you to follow up in 3 days.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "💡 Average response rate for cold creator outreach is 5-10%. With personalized messages it jumps to 20-30%. Don't get discouraged — volume and quality both matter.",
      },
    ],
  },
  commission: {
    title: "Set up commission tracking",
    readTime: "6 min read",
    blocks: [
      {
        type: "intro",
        text: "Commission tracking is what separates Trackit from every other creator tool. Instead of manually checking who sold what, every sale is attributed automatically the moment it happens.",
      },
      {
        type: "section",
        title: "How it works",
        text: "When you add a creator to a campaign, Trackit generates two things: a unique discount code (EMMA15) and a unique referral link (trackit.app/r/emma_abc123). When a customer uses either at checkout, the sale is instantly attributed to that creator.",
      },
      { type: "step", number: 1, title: "Create a campaign", text: "Go to Campaigns → New Campaign. Give it a name, set the dates, and choose your commission structure." },
      {
        type: "step",
        number: 2,
        title: "Set commission rate",
        text: "Percentage commission (8-15%) works best for most ecommerce brands. Fixed amount works better for high-ticket products. Start at 10% and adjust based on margins.",
      },
      {
        type: "step",
        number: 3,
        title: "Add creators",
        text: "Add creators to your campaign. Each creator automatically gets their unique code and link.",
      },
      {
        type: "step",
        number: 4,
        title: "Share assets with creators",
        text: "Send each creator their unique discount code and referral link. They add it to their bio, posts, and videos.",
      },
      {
        type: "step",
        number: 5,
        title: "Watch sales come in",
        text: "Every sale appears in your Payouts dashboard in real time with the creator attribution and commission amount calculated automatically.",
      },
      {
        type: "callout",
        variant: "pro",
        text: "💡 Turn on Auto payout in Payouts settings. When a creator reaches the minimum threshold (e.g. $50), Trackit pays them automatically. No manual transfers, no forgotten payments.",
      },
    ],
  },
  analytics: {
    title: "Read your analytics",
    readTime: "4 min read",
    blocks: [
      {
        type: "intro",
        text: "Analytics tells you which creators are actually making you money and which are just posting without driving sales. Use this data to double down on winners and cut underperformers.",
      },
      {
        type: "section",
        title: "The most important metrics",
        text: "Focus on three numbers: Revenue per creator (how much each partner actually drives), ROI (revenue divided by commission paid), and Conversion rate (clicks to purchases from their referral link).",
      },
      { type: "step", number: 1, title: "Open Analytics", text: "Click Analytics in the sidebar. Set the date range to Last 30 days for your first review." },
      {
        type: "step",
        number: 2,
        title: "Check top performers",
        text: "Scroll to Top Performing Creators. Sort by Revenue. Your top 3 creators likely drive 80% of your results. These are your VIPs — treat them accordingly.",
      },
      {
        type: "step",
        number: 3,
        title: "Check the funnel",
        text: "Look at the Outreach Performance chart. If you're sending lots of outreach but getting few partnerships, your message needs work. If partnerships are high but sales are low, your creators aren't the right fit.",
      },
      {
        type: "step",
        number: 4,
        title: "Platform breakdown",
        text: "Check which platform drives the most revenue for your brand. Double down on that platform in your next creator search.",
      },
      {
        type: "step",
        number: 5,
        title: "Monthly review habit",
        text: "Set a calendar reminder every first Monday of the month. Spend 20 minutes in Analytics. Identify your top 3 creators, cut or pause the bottom 3, and plan your next outreach batch.",
      },
      {
        type: "callout",
        variant: "action",
        text: "💡 Export your analytics to CSV every month. Over time you'll build a clear picture of which creator profile (niche, platform, follower range) converts best for your specific brand.",
      },
    ],
  },
};

const FAQ_ITEMS = [
  {
    q: "How does Trackit track creator sales?",
    a: "Trackit connects to your Shopify store via webhook. Every creator gets a unique discount code and referral link. When a customer uses either at checkout, Trackit automatically attributes the sale and calculates the commission.",
  },
  {
    q: "Can I use Trackit without a Shopify store?",
    a: "Yes. You can use Discovery, Outreach, and the CRM features without connecting Shopify. Shopify integration is required for automatic sale tracking and commission payouts.",
  },
  {
    q: "How do I pay my creators?",
    a: "Trackit handles payouts via Stripe Connect. Creators connect their bank account or card once. You top up your Trackit balance and hit pay. Money goes directly to the creator.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The free plan gives you 5 creator searches per day, basic outreach templates, and 1 Shopify store connection. Upgrade to Pro for unlimited everything.",
  },
  {
    q: "How does the AI outreach work?",
    a: "You select a creator. Trackit AI reads their profile, content style, and niche, then generates a personalized message for your brand. You edit it if needed and send. Response rates are 3x higher than generic templates.",
  },
  {
    q: "Can I import my existing creators?",
    a: "Yes. Go to Creators → Import CSV. Download the template, fill in your creator data, and upload. All creators import in under 30 seconds.",
  },
  {
    q: "What platforms does Trackit support?",
    a: "TikTok, Instagram, and YouTube for discovery and outreach. Shopify for sale tracking. More platforms coming soon.",
  },
  {
    q: "How do referral links work?",
    a: "When you add a creator to a campaign, Trackit auto-generates a unique referral link like trackit.app/r/creatorname. Every click and purchase through that link is attributed to the creator automatically.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no lock-ins. Cancel from Settings → Billing anytime. You keep access until the end of your billing period.",
  },
  {
    q: "How do I contact support?",
    a: "Chat with us using the button at the top of this page. We reply in under 5 minutes during business hours. For non-urgent questions email support@trackit.app.",
  },
];

const VIDEOS = [
  { title: "Connect Shopify in 60 seconds", duration: "3:24" },
  { title: "Find and contact your first creator", duration: "4:12" },
  { title: "Set up automated commission payouts", duration: "5:01" },
];

function GuideCallout({ text, variant }: { text: string; variant: "tip" | "pro" | "action" | "troubleshoot" }) {
  const styles: Record<string, { bg: string; border: string }> = {
    tip: { bg: "#F0F6FF", border: "#0047FF" },
    pro: { bg: "#FFFBEB", border: "#F59E0B" },
    action: { bg: "#F0F6FF", border: "#0047FF" },
    troubleshoot: { bg: "#F5F5F5", border: "#9A9A9A" },
  };
  const s = styles[variant];
  return (
    <div
      style={{
        background: s.bg,
        borderLeft: `4px solid ${s.border}`,
        borderRadius: 10,
        padding: "14px 16px",
        fontSize: 14,
        color: "#1A1A1A",
        lineHeight: 1.55,
        marginTop: 8,
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
}

function GuideBlockRenderer({ block }: { block: GuideBlock }) {
  if (block.type === "intro") {
    return (
      <p style={{ fontSize: 16, color: "#1A1A1A", lineHeight: 1.65, margin: "0 0 32px", letterSpacing: "-0.02em" }}>{block.text}</p>
    );
  }
  if (block.type === "section") {
    return (
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", margin: "0 0 10px", letterSpacing: "-0.03em" }}>{block.title}</h2>
        <p style={{ fontSize: 15, color: "#4A4A4A", lineHeight: 1.65, margin: 0 }}>{block.text}</p>
      </div>
    );
  }
  if (block.type === "step") {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: block.tip ? 10 : 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#1A1A1A",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {block.number}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{block.title}</h3>
            <p style={{ fontSize: 15, color: "#4A4A4A", lineHeight: 1.65, margin: 0 }}>{block.text}</p>
          </div>
        </div>
        {block.tip && <GuideCallout text={block.tip} variant="tip" />}
      </div>
    );
  }
  return <GuideCallout text={block.text} variant={block.variant} />;
}

function GuideModal({ guideId, onClose }: { guideId: string; onClose: () => void }) {
  const content = GUIDE_CONTENT[guideId];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [guideId]);

  if (!content) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
      }}
    >
      <div style={{ height: 3, background: "#EFEFEF", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "#0047FF", transition: "width 0.1s ease-out" }} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 24px",
          borderBottom: "1px solid #EFEFEF",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: 14,
            fontWeight: 500,
            color: "#1A1A1A",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "8px 0",
            flexShrink: 0,
          }}
        >
          ← Back to Help Center
        </button>
        <h1
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#1A1A1A",
            margin: 0,
            textAlign: "center",
            flex: 1,
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {content.title}
        </h1>
        <span style={{ fontSize: 13, color: "#9A9A9A", flexShrink: 0, minWidth: 72, textAlign: "right" }}>{content.readTime}</span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", scrollBehavior: "smooth" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px" }}>
          {content.blocks.map((block, i) => (
            <GuideBlockRenderer key={i} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HelpCenterView() {
  const [search, setSearch] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [openGuideId, setOpenGuideId] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filteredFaq = useMemo(() => {
    if (!q) return FAQ_ITEMS.map((item, i) => ({ ...item, index: i }));
    return FAQ_ITEMS.map((item, i) => ({ ...item, index: i })).filter(
      (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <div style={{ minHeight: "100%" }}>
      <div style={{ padding: "32px 40px 28px", borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.04em" }}>Help Center</h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px" }}>Everything you need to get the most out of Trackit.</p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#FAFAFA",
            border: "1px solid #EFEFEF",
            borderRadius: 12,
            padding: "14px 18px",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for help..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 16,
              fontFamily: "inherit",
              color: "#1A1A1A",
              letterSpacing: "-0.02em",
            }}
          />
        </div>
      </div>

      <div style={{ padding: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 48 }}>
          {[
            {
              icon: "💬",
              title: "Chat with us",
              text: "Get a reply in under 5 minutes from our team.",
              action: "Start chat →",
              onClick: () => window.alert("Live chat coming soon — email us at support@trackit.app for now."),
            },
            {
              icon: "📧",
              title: "Email support",
              text: "Send us a detailed message and we'll get back within 24h.",
              action: "Send email →",
              href: `mailto:${SUPPORT_EMAIL}`,
            },
            {
              icon: "📅",
              title: "Book a call",
              text: "Talk directly with the founder. 15 minutes, no fluff.",
              action: "Book call →",
              href: CALENDLY_URL,
            },
          ].map((card) => (
            <div
              key={card.title}
              style={{
                background: "#FFFFFF",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                padding: 24,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span style={{ fontSize: 28, marginBottom: 12 }} aria-hidden>
                {card.icon}
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{card.title}</h3>
              <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px", lineHeight: 1.5, flex: 1 }}>{card.text}</p>
              {"href" in card && card.href ? (
                <a
                  href={card.href}
                  target={card.href.startsWith("http") ? "_blank" : undefined}
                  rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  style={{ ...btnBlack, textDecoration: "none", textAlign: "center", display: "inline-block" }}
                >
                  {card.action}
                </a>
              ) : (
                <button type="button" onClick={card.onClick} style={btnBlack}>
                  {card.action}
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.03em" }}>Getting started</h2>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#0047FF",
                background: "rgba(0,71,255,0.1)",
                padding: "4px 10px",
                borderRadius: 999,
                letterSpacing: "0.04em",
              }}
            >
              START HERE
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {GUIDES.map((guide) => (
              <div
                key={guide.title}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EFEFEF",
                  borderRadius: 16,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span style={{ fontSize: 24, marginBottom: 10 }} aria-hidden>
                  {guide.icon}
                </span>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{guide.title}</h3>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 14px", lineHeight: 1.5, flex: 1 }}>{guide.text}</p>
                <span style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 14 }}>{guide.tag}</span>
                <button type="button" onClick={() => setOpenGuideId(guide.id)} style={{ ...btnSecondary, alignSelf: "flex-start" }}>
                  Read guide →
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 20px", letterSpacing: "-0.03em" }}>Frequently asked questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredFaq.length === 0 ? (
              <p style={{ fontSize: 14, color: "#7A7A7A", padding: 20, background: "#FFFFFF", borderRadius: 12, border: "1px solid #EFEFEF" }}>
                No questions match your search.
              </p>
            ) : (
              filteredFaq.map((item) => {
                const isOpen = openFaq === item.index;
                return (
                  <div
                    key={item.index}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #EFEFEF",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : item.index)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        padding: "16px 20px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{item.q}</span>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                      >
                        <path d="M6 9l6 6 6-6" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 20px 16px", fontSize: 14, color: "#7A7A7A", lineHeight: 1.55, letterSpacing: "-0.01em" }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px", letterSpacing: "-0.03em" }}>Video tutorials</h2>
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px" }}>Watch and learn in under 5 minutes.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {VIDEOS.map((video) => (
              <div key={video.title} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "16 / 9",
                    background: "#E5E5E5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.45)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.04em" }}>COMING SOON</span>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M10 8l8 4-8 4V8z" fill="#1A1A1A" />
                    </svg>
                  </div>
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      zIndex: 2,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#FFFFFF",
                      background: "rgba(0,0,0,0.6)",
                      padding: "4px 8px",
                      borderRadius: 6,
                    }}
                  >
                    {video.duration}
                  </span>
                </div>
                <div style={{ padding: "16px 18px 18px" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 10px", letterSpacing: "-0.02em" }}>{video.title}</h3>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#0047FF",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Watch now →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "#1A1A1A",
            borderRadius: 16,
            padding: "40px 36px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#FFFFFF", margin: "0 0 8px", letterSpacing: "-0.03em" }}>Still need help?</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: "0 0 24px", lineHeight: 1.5 }}>
            Our team is here for you. Average response time under 5 minutes.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => window.alert("Live chat coming soon — email us at support@trackit.app for now.")}
              style={{
                background: "#FFFFFF",
                color: "#1A1A1A",
                border: "none",
                borderRadius: 10,
                padding: "12px 22px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Chat with us →
            </button>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{
                background: "transparent",
                color: "#FFFFFF",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 10,
                padding: "12px 22px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              Email support →
            </a>
          </div>
        </div>
      </div>

      {openGuideId && <GuideModal guideId={openGuideId} onClose={() => setOpenGuideId(null)} />}
    </div>
  );
}
