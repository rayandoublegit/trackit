"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";

type Script = {
  id: string;
  title: string;
  content: string | null;
  file_url: string | null;
  target_creator_id: string | null;
  targetName: string | null;
  created_at: string;
};

type CreatorOpt = { id: string; label: string };

export function ScriptsManager({ brandId, isMobile }: { brandId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [creators, setCreators] = useState<CreatorOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadScripts = async () => {
    if (!brandId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/scripts?brandId=${brandId}`);
      const data = await res.json();
      if (data?.ok) setScripts(data.scripts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadScripts(); }, [brandId]);

  useEffect(() => {
    const loadCreators = async () => {
      if (!supabase || !brandId) return;
      const { data } = await supabase.from("creators").select("id, handle, full_name").eq("user_id", brandId);
      setCreators((data || []).map((c) => ({ id: c.id, label: c.full_name || c.handle })));
    };
    void loadCreators();
  }, [brandId]);

  const resetForm = () => { setTitle(""); setContent(""); setLink(""); setFile(null); setTarget("all"); setError(""); };

  const handleSubmit = async () => {
    if (!brandId) { setError(lang === "fr" ? "Erreur : compte marque non identifié. Rafraîchissez la page." : "Error: brand account not identified. Refresh the page."); return; }
    if (!title.trim()) { setError(lang === "fr" ? "Le titre est requis." : "Title is required."); return; }
    setSaving(true); setError("");
    try {
      let fileUrl = link.trim() || null;
      if (file && supabase) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${brandId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("scripts").upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) { setError(upErr.message); return; }
        const { data: pub } = supabase.storage.from("scripts").getPublicUrl(path);
        fileUrl = pub.publicUrl;
      }
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, title: title.trim(), content: content.trim(), fileUrl, targetCreatorId: target === "all" ? null : target }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setError(data?.error || (lang === "fr" ? "Échec." : "Failed.")); return; }
      resetForm(); setFormOpen(false);
      await loadScripts();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!brandId) return;
    await fetch(`/api/scripts?id=${id}&brandId=${brandId}`, { method: "DELETE" });
    await loadScripts();
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
  };

  const targetLabel = (s: Script) =>
    s.targetName
      ? (lang === "fr" ? s.targetName : s.targetName)
      : (lang === "fr" ? "Tous les créateurs" : "All creators");

  const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 14 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "rgba(0,0,0,0.55)", marginBottom: 6, letterSpacing: "-0.01em" };

  const subtitle =
    loading
      ? (lang === "fr" ? "Chargement..." : "Loading...")
      : scripts.length === 0
        ? (lang === "fr" ? "Partagez des scripts et briefs avec vos créateurs" : "Share scripts and briefs with your creators")
        : lang === "fr"
          ? `${scripts.length} script${scripts.length > 1 ? "s" : ""} partagé${scripts.length > 1 ? "s" : ""}`
          : `${scripts.length} script${scripts.length > 1 ? "s" : ""} shared`;

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden", marginTop: 32 }}>
      <div style={{ padding: "18px 20px", borderBottom: "1px solid #EFEFEF" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
              Scripts
            </div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
              {subtitle}
            </div>
          </div>
          {!formOpen && (
            <button type="button" onClick={() => setFormOpen(true)} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.01em", flexShrink: 0 }}>
              {lang === "fr" ? "+ Nouveau script" : "+ New script"}
            </button>
          )}
        </div>
      </div>

      {formOpen && (
        <div style={{ padding: "20px", borderBottom: "1px solid #EFEFEF", background: "#FAFAFA" }}>
          <label style={labelStyle}>{lang === "fr" ? "Titre" : "Title"}</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={lang === "fr" ? "Ex : Brief vidéo lancement" : "e.g. Launch video brief"} style={inputStyle} />

          <label style={labelStyle}>{lang === "fr" ? "Contenu" : "Content"}</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={lang === "fr" ? "Le script ou les instructions..." : "The script or instructions..."} rows={5} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

          <label style={labelStyle}>{lang === "fr" ? "Fichier joint (optionnel)" : "Attachment (optional)"}</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginBottom: 10, fontSize: 14 }} />
          <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 14 }}>{lang === "fr" ? "Ou collez un lien (Drive, YouTube...)" : "Or paste a link (Drive, YouTube...)"}</div>
          <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." style={inputStyle} />

          <label style={labelStyle}>{lang === "fr" ? "Destinataire" : "Recipient"}</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle}>
            <option value="all">{lang === "fr" ? "Tous mes créateurs" : "All my creators"}</option>
            {creators.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>

          {error && <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 14 }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={handleSubmit} disabled={saving} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? (lang === "fr" ? "Envoi..." : "Sending...") : (lang === "fr" ? "Envoyer le script" : "Send script")}
            </button>
            <button type="button" onClick={() => { setFormOpen(false); resetForm(); }} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "#FFFFFF", color: "#1A1A1A", fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
              {lang === "fr" ? "Annuler" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>
            {lang === "fr" ? "Chargement..." : "Loading..."}
          </div>
        ) : scripts.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", marginBottom: 6 }}>
              {lang === "fr" ? "Aucun script pour le moment" : "No scripts yet"}
            </div>
            <div style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
              {lang === "fr" ? "Créez votre premier script pour vos créateurs." : "Create your first script for your creators."}
            </div>
          </div>
        ) : isMobile ? (
          scripts.map((s, i) => (
            <div
              key={s.id}
              style={{
                padding: "16px 20px",
                borderBottom: i < scripts.length - 1 ? "1px solid #F5F5F5" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: s.content ? 8 : 0 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
                    {targetLabel(s)} · {fmtDate(s.created_at)}
                  </div>
                </div>
                <button type="button" onClick={() => handleDelete(s.id)} style={{ background: "none", border: "none", color: "#B5B5B5", fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {lang === "fr" ? "Supprimer" : "Delete"}
                </button>
              </div>
              {s.content && (
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", lineHeight: 1.45, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
                  {s.content.length > 120 ? `${s.content.slice(0, 120)}…` : s.content}
                </p>
              )}
              {s.file_url && (
                <a href={s.file_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 13, color: BLUE, fontWeight: 500, textDecoration: "none" }}>
                  {lang === "fr" ? "Voir le fichier joint" : "View attachment"} →
                </a>
              )}
            </div>
          ))
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 0.9fr 1.2fr",
                gap: 12,
                padding: "14px 20px",
                background: "#FAFAFA",
                borderBottom: "1px solid #EFEFEF",
                fontSize: 12,
                fontWeight: 500,
                color: "#9A9A9A",
              }}
            >
              {[lang === "fr" ? "Titre" : "Title", lang === "fr" ? "Destinataire" : "Recipient", lang === "fr" ? "Date" : "Date", lang === "fr" ? "Actions" : "Actions"].map((h) => (
                <div key={h}>{h}</div>
              ))}
            </div>
            {scripts.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 0.9fr 1.2fr",
                  gap: 12,
                  padding: "16px 20px",
                  alignItems: "center",
                  borderBottom: i < scripts.length - 1 ? "1px solid #F5F5F5" : "none",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: s.content ? 4 : 0 }}>{s.title}</div>
                  {s.content && (
                    <div style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.content}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#1A1A1A" }}>{targetLabel(s)}</div>
                <div style={{ fontSize: 13, color: "#7A7A7A" }}>{fmtDate(s.created_at)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {s.file_url && (
                    <a href={s.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: BLUE, fontWeight: 500, textDecoration: "none" }}>
                      {lang === "fr" ? "Fichier" : "File"} →
                    </a>
                  )}
                  <button type="button" onClick={() => handleDelete(s.id)} style={{ background: "none", border: "none", color: "#B5B5B5", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                    {lang === "fr" ? "Supprimer" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
