"use client";

import { useRef, useState } from "react";

const CALENDLY_URL = "https://calendly.com/trackit/15min";

const PAGE_OPTIONS = ["Discovery", "Outreach", "Payouts", "Campaigns", "Analytics", "Other"];

const btnPrimary: React.CSSProperties = {
  background: "#0047FF",
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #E5E5E5",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
  background: "#FFFFFF",
};

type ModalKind = "feature" | "bug" | "review" | null;

type RoadmapItem = { id: string; label: string; votes: number };

const INITIAL_PLANNED: RoadmapItem[] = [
  { id: "p1", label: "Automated follow up sequences", votes: 47 },
  { id: "p2", label: "TikTok Shop integration", votes: 38 },
  { id: "p3", label: "Bulk outreach CSV import", votes: 29 },
];

const IN_PROGRESS = [
  { label: "Shopify webhook tracking", progress: 72 },
  { label: "AI outreach generation", progress: 55 },
  { label: "Commission auto payout", progress: 40 },
];

const SHIPPED = ["Creator discovery search", "Campaign management", "Basic CRM"];

export function FeedbackView({ onBackToDashboard }: { onBackToDashboard?: () => void }) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [submitted, setSubmitted] = useState(false);
  const [planned, setPlanned] = useState(INITIAL_PLANNED);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  const upvote = (id: string) => {
    if (votedIds.has(id)) return;
    setVotedIds((prev) => new Set(prev).add(id));
    setPlanned((list) => list.map((item) => (item.id === id ? { ...item, votes: item.votes + 1 } : item)));
  };

  const handleSubmit = () => {
    setModal(null);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div style={{ padding: 40, minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: "0 0 12px 0" }}>Got it. Thank you.</h1>
          <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", lineHeight: 1.55, margin: "0 0 28px 0" }}>
            We read every single submission. You&apos;ll hear from us within 24 hours if we have questions.
          </p>
          <button
            type="button"
            style={btnPrimary}
            onClick={() => {
              setSubmitted(false);
              onBackToDashboard?.();
            }}
          >
            Back to dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "32px 40px 24px 40px", borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 6 }}>Feedback</h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
          Help us build Trackit. Share ideas, report issues, or tell us how we&apos;re doing.
        </p>
      </div>

      <div style={{ padding: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 40 }}>
          <ActionCard icon="💡" title="Suggest a feature" text="Got an idea that would make Trackit better? Tell us exactly what you need." button="Submit idea →" onClick={() => setModal("feature")} />
          <ActionCard icon="🐛" title="Report a bug" text="Something broken? Tell us what happened and we'll fix it fast." button="Report bug →" onClick={() => setModal("bug")} />
          <ActionCard icon="⭐" title="Rate your experience" text="How is Trackit working for you so far? Your honest feedback shapes the product." button="Leave review →" onClick={() => setModal("review")} />
        </div>

        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 6px 0" }}>What we&apos;re building next.</h2>
          <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: "0 0 24px 0" }}>Vote on features to help us prioritize.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            <RoadmapColumn title="Planned" accent="#0047FF">
              {planned.map((item) => (
                <PlannedRow key={item.id} label={item.label} votes={item.votes} voted={votedIds.has(item.id)} onUpvote={() => upvote(item.id)} />
              ))}
            </RoadmapColumn>

            <RoadmapColumn title="In progress" accent="#F57F17">
              {IN_PROGRESS.map((item) => (
                <InProgressRow key={item.label} label={item.label} progress={item.progress} />
              ))}
            </RoadmapColumn>

            <RoadmapColumn title="Shipped" accent="#2E7D32">
              {SHIPPED.map((label) => (
                <ShippedRow key={label} label={label} />
              ))}
            </RoadmapColumn>
          </div>
        </div>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            padding: 32,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>Want to talk directly?</h3>
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 480, lineHeight: 1.5 }}>
              Book a 15 minute call with Rayan, the founder. Tell us exactly what you need.
            </p>
          </div>
          <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, textDecoration: "none", display: "inline-block" }}>
            Book a call →
          </a>
        </div>
      </div>

      {modal === "feature" && <FeatureModal onClose={() => setModal(null)} onSubmit={handleSubmit} />}
      {modal === "bug" && <BugModal onClose={() => setModal(null)} onSubmit={handleSubmit} />}
      {modal === "review" && <ReviewModal onClose={() => setModal(null)} onSubmit={handleSubmit} />}
    </>
  );
}

function ActionCard({ icon, title, text, button, onClick }: { icon: string; title: string; text: string; button: string; onClick: () => void }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #EFEFEF",
        borderRadius: 16,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 32, lineHeight: 1 }}>{icon}</span>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0 }}>{title}</h3>
      <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.5, flex: 1 }}>{text}</p>
      <button type="button" onClick={onClick} style={{ ...btnSecondary, alignSelf: "flex-start", marginTop: 4 }}>
        {button}
      </button>
    </div>
  );
}

function RoadmapColumn({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20 }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: accent, letterSpacing: "-0.01em", margin: "0 0 16px 0", textTransform: "uppercase" }}>{title}</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function PlannedRow({ label, votes, voted, onUpvote }: { label: string; votes: number; voted: boolean; onUpvote: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13, color: "#1A1A1A", letterSpacing: "-0.01em", lineHeight: 1.4 }}>{label}</span>
      <button
        type="button"
        onClick={onUpvote}
        disabled={voted}
        style={{
          ...btnSecondary,
          padding: "6px 10px",
          fontSize: 12,
          flexShrink: 0,
          opacity: voted ? 0.6 : 1,
          cursor: voted ? "default" : "pointer",
        }}
      >
        ▲ {votes}
      </button>
    </div>
  );
}

function InProgressRow({ label, progress }: { label: string; progress: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#1A1A1A", letterSpacing: "-0.01em" }}>{label}</span>
        <span style={{ fontSize: 12, color: "#9A9A9A" }}>{progress}%</span>
      </div>
      <div style={{ height: 6, background: "#F5F5F5", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "#0047FF", borderRadius: 99 }} />
      </div>
    </div>
  );
}

function ShippedRow({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: "#2E7D32", fontSize: 16, fontWeight: 600 }}>✓</span>
      <span style={{ fontSize: 13, color: "#1A1A1A", letterSpacing: "-0.01em" }}>{label}</span>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }} onClick={onClose}>
      <div
        style={{ background: "#FFFFFF", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "24px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.03em" }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, color: "#9A9A9A", cursor: "pointer", padding: 0 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function SegmentedToggle({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", background: "#F5F5F5", borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            fontSize: 13,
            fontFamily: "inherit",
            fontWeight: value === opt ? 500 : 400,
            cursor: "pointer",
            background: value === opt ? "#FFFFFF" : "transparent",
            color: value === opt ? "#1A1A1A" : "#7A7A7A",
            boxShadow: value === opt ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            letterSpacing: "-0.02em",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function FeatureModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const [title, setTitle] = useState("");
  const [page, setPage] = useState(PAGE_OPTIONS[0]);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Important");

  return (
    <ModalShell title="Suggest a feature" onClose={onClose}>
      <Field label="What do you want?">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short feature title" style={inputStyle} />
      </Field>
      <Field label="Which page is this for?">
        <select value={page} onChange={(e) => setPage(e.target.value)} style={inputStyle}>
          {PAGE_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="Describe exactly what you need and why it matters to your business.">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} placeholder="Tell us the workflow, pain point, and expected outcome..." />
      </Field>
      <Field label="Priority for you">
        <SegmentedToggle options={["Nice to have", "Important", "Critical"]} value={priority} onChange={setPriority} />
      </Field>
      <button type="button" style={{ ...btnPrimary, width: "100%", marginTop: 8 }} onClick={onSubmit}>
        Send suggestion →
      </button>
    </ModalShell>
  );
}

function BugModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const [page, setPage] = useState(PAGE_OPTIONS[0]);
  const [intent, setIntent] = useState("");
  const [happened, setHappened] = useState("");
  const [frequency, setFrequency] = useState("Sometimes");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <ModalShell title="Report a bug" onClose={onClose}>
      <Field label="Page where bug occurred">
        <select value={page} onChange={(e) => setPage(e.target.value)} style={inputStyle}>
          {PAGE_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="What were you trying to do?">
        <input type="text" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="e.g. Export payout report for last month" style={inputStyle} />
      </Field>
      <Field label="What happened instead?">
        <textarea value={happened} onChange={(e) => setHappened(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} placeholder="Describe the error or unexpected behavior..." />
      </Field>
      <Field label="How often does this happen?">
        <SegmentedToggle options={["Always", "Sometimes", "Once"]} value={frequency} onChange={setFrequency} />
      </Field>
      <Field label="Screenshot upload (optional)">
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
        <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={() => fileRef.current?.click()}>
          {fileName ? fileName : "Choose file"}
        </button>
      </Field>
      <button type="button" style={{ ...btnPrimary, width: "100%", marginTop: 8 }} onClick={onSubmit}>
        Report bug →
      </button>
    </ModalShell>
  );
}

function ReviewModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const [rating, setRating] = useState(0);
  const [workingWell, setWorkingWell] = useState("");
  const [improve, setImprove] = useState("");
  const [recommend, setRecommend] = useState("Maybe");

  return (
    <ModalShell title="How is Trackit working for you?" onClose={onClose}>
      <StarRating value={rating} onChange={setRating} />
      <Field label="What's working well?">
        <textarea value={workingWell} onChange={(e) => setWorkingWell(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Features or workflows you love..." />
      </Field>
      <Field label="What needs improvement?">
        <textarea value={improve} onChange={(e) => setImprove(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="What feels slow, confusing, or missing..." />
      </Field>
      <Field label="Would you recommend Trackit to another brand?">
        <SegmentedToggle options={["Yes", "No", "Maybe"]} value={recommend} onChange={setRecommend} />
      </Field>
      <button type="button" style={{ ...btnPrimary, width: "100%", marginTop: 8 }} onClick={onSubmit}>
        Send feedback →
      </button>
    </ModalShell>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Rate ${n} stars`}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 40,
            lineHeight: 1,
            padding: 4,
            color: n <= value ? "#F5A623" : "#E5E5E5",
            transition: "color 0.15s ease, transform 0.1s ease",
            transform: n <= value ? "scale(1.05)" : "scale(1)",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
