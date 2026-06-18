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
    if (!brandId || !title.trim()) { setError(lang === "fr" ? "Le titre est requis." : "Title is required."); return; }
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

  const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 14 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "rgba(0,0,0,0.55)", marginBottom: 6, letterSpacing: "-0.01em" };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", margin: 0, letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "Partagez des scripts et briefs avec vos créateurs." : "Share scripts and briefs with your creators."}
        </p>
        {!formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "+ Nouveau script" : "+ New script"}
          </button>
        )}
      </div>

      {formOpen && (
        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, marginBottom: 24 }}>
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

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={handleSubmit} disabled={saving} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? (lang === "fr" ? "Envoi..." : "Sending...") : (lang === "fr" ? "Envoyer le script" : "Send script")}
            </button>
            <button type="button" onClick={() => { setFormOpen(false); resetForm(); }} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "#FFFFFF", color: "#1A1A1A", fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
              {lang === "fr" ? "Annuler" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#9A9A9A", fontSize: 14 }}>{lang === "fr" ? "Chargement..." : "Loading..."}</div>
      ) : scripts.length === 0 ? (
        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 6 }}>{lang === "fr" ? "Aucun script pour le moment" : "No scripts yet"}</div>
          <p style={{ fontSize: 14, color: "rgba(0,0,0,0.45)", margin: 0 }}>{lang === "fr" ? "Créez votre premier script pour vos créateurs." : "Create your first script for your creators."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scripts.map((s) => (
            <div key={s.id} style={{ border: "1px solid #EFEFEF", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: s.content ? 10 : 0 }}>
                    {fmtDate(s.created_at)} · {s.targetName ? (lang === "fr" ? `Pour ${s.targetName}` : `For ${s.targetName}`) : (lang === "fr" ? "Tous les créateurs" : "All creators")}
                  </div>
                  {s.content && <p style={{ fontSize: 14, color: "rgba(0,0,0,0.7)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>{s.content}</p>}
                  {s.file_url && <a href={s.file_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 14, color: BLUE, fontWeight: 500, textDecoration: "none" }}>{lang === "fr" ? "Voir le fichier joint" : "View attachment"} →</a>}
                </div>
                <button type="button" onClick={() => handleDelete(s.id)} style={{ background: "none", border: "none", color: "#B5B5B5", fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {lang === "fr" ? "Supprimer" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
