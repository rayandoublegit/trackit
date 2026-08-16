"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

export function FeedbackView({ isMobile }: { isMobile?: boolean }) {
  const lang = useLang();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [existing, setExisting] = useState<{ rating: number; message: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("feedback")
        .select("rating, message")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setExisting(data);
        setRating(data.rating);
        setMessage(data.message || "");
      }
      setLoading(false);
    };
    void load();
  }, []);

  const handleSubmit = async () => {
    if (!rating || !supabase) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    await supabase.from("feedback").upsert({
      user_id: user.id,
      rating,
      message,
      username: profile?.username || null,
      email: user.email || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    setExisting({ rating, message });
    setEditing(false);
    setSubmitted(true);
    setSaving(false);
  };

  if (loading) return <div style={{ paddingTop: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 40, paddingLeft: isMobile ? 16 : 40, color: "var(--ws-text-muted)", fontSize: 14 }}>Loading...</div>;

  if (existing && !editing) {
    return (
      <div style={{ paddingTop: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 40, paddingLeft: isMobile ? 16 : 40, maxWidth: 520 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 6px", color: "var(--ws-text)" }}>{lang === "fr" ? "Votre avis" : "Your review"}</h1>
        <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: "0 0 32px" }}>{lang === "fr" ? "Merci pour votre avis." : "Thanks for your feedback."}</p>
        <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[1,2,3,4,5].map(s => (
              <span key={s} style={{ fontSize: 28, color: s <= existing.rating ? "#F59E0B" : "var(--ws-border)" }}>★</span>
            ))}
          </div>
          {existing.message && (
            <p style={{ fontSize: 14, color: "var(--ws-text)", margin: 0, lineHeight: 1.6 }}>{existing.message}</p>
          )}
          <button
            type="button"
            onClick={() => { setEditing(true); setSubmitted(false); }}
            style={{ background: "none", border: "1px solid var(--ws-border)", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: "var(--ws-text)", letterSpacing: "-0.02em", alignSelf: "flex-start" }}
          >
            {lang === "fr" ? "Modifier mon avis →" : "Change my review →"}
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ paddingTop: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 40, paddingLeft: isMobile ? 16 : 40, maxWidth: 520 }}>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 8px", color: "var(--ws-text)" }}>{lang === "fr" ? "Merci pour votre avis !" : "Thank you for your feedback!"}</h2>
          <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: 0 }}>{lang === "fr" ? "Votre avis a été soumis." : "Your review has been submitted."}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 40, paddingLeft: isMobile ? 16 : 40, maxWidth: 520 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 6px", color: "var(--ws-text)" }}>
        {editing ? "Update your review" : lang === "fr" ? "Laisser un avis" : "Leave a review"}
      </h1>
      <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: "0 0 32px" }}>{lang === "fr" ? "Comment Trackit fonctionne-t-il pour vous ?" : "How is Trackit working for you?"}</p>
      <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 12 }}>{lang === "fr" ? "Votre note" : "Your rating"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1,2,3,4,5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(star)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 32, color: star <= (hovered || rating) ? "#F59E0B" : "var(--ws-border)", transition: "color 0.1s" }}
              >★</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 8 }}>{lang === "fr" ? "Dites-nous en plus (optionnel)" : "Tell us more (optional)"}</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={lang === "fr" ? "Dites-nous en plus (optionnel)" : "Tell us more (optional)"}
            rows={4}
            style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--ws-border)", borderRadius: 10, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", color: "var(--ws-text)", background: "var(--ws-input)" }}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{ background: "none", border: "1px solid var(--ws-border)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: "var(--ws-text)" }}
            >Cancel</button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!rating || saving}
            style={{ background: rating ? "var(--ws-accent)" : "var(--ws-border)", color: rating ? "#fff" : "var(--ws-text-dim)", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: rating ? "pointer" : "not-allowed", letterSpacing: "-0.02em" }}
          >
            {saving ? "Saving..." : lang === "fr" ? "Soumettre l'avis →" : "Submit review →"}
          </button>
        </div>
      </div>
    </div>
  );
}
