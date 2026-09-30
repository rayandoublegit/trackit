"use client";

import { useState } from "react";
import { useLang } from "@/lib/useLang";

type Row = {
  id: number;
  handle: string;
  displayName: string;
  followers: string;
  bio: string;
  niches: string;
  language: string;
  location: string;
  avatarUrl: string;
  currentAvatar?: string;
  video1: string;
  video2: string;
  video3: string;
  status: "" | "saving" | "err";
  msg: string;
};

let counter = 1;
const emptyRow = (): Row => ({
  id: counter++,
  handle: "", displayName: "", followers: "", bio: "",
  niches: "", language: "fr", location: "France",
  avatarUrl: "", currentAvatar: "", video1: "", video2: "", video3: "", status: "", msg: "",
});

export default function AddCreatorPage() {
  const [editMode, setEditMode] = useState(false);
  const [platform, setPlatform] = useState<"TikTok" | "Instagram">("TikTok");
  const [loadHandle, setLoadHandle] = useState("");
  const [loadMsg, setLoadMsg] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [savedTotal, setSavedTotal] = useState(0);
  const [savedLog, setSavedLog] = useState<string[]>([]);
  const fr = useLang() === "fr";
  const t = (en: string, frText: string) => (fr ? frText : en);

  const update = (id: number, key: keyof Row, val: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  };

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (id: number) =>
    setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((r) => r.id !== id)));

  const deleteCreator = async () => {
    const h = (rows[0]?.handle || loadHandle).trim();
    if (!h) { setLoadMsg(t("load a creator first", "chargez d’abord un créateur")); return; }
    if (!window.confirm(t(`Delete @${h.replace(/^@/, "")} permanently?`, `Supprimer définitivement @${h.replace(/^@/, "")} ?`))) return;
    setLoadMsg(t("deleting…", "suppression…"));
    try {
      const res = await fetch(`/api/admin/add-creator?handle=${encodeURIComponent(h)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setLoadMsg(data.error || t("delete failed", "échec de la suppression")); return; }
      setLoadMsg(t(`deleted @${data.deleted}`, `@${data.deleted} supprimé`));
      setRows([emptyRow()]);
      setLoadHandle("");
    } catch (e) {
      setLoadMsg(String(e));
    }
  };

  const loadCreator = async () => {
    if (!loadHandle.trim()) { setLoadMsg(t("enter a handle", "saisissez un pseudo")); return; }
    setLoadMsg(t("loading…", "chargement…"));
    try {
      const res = await fetch(`/api/admin/add-creator?handle=${encodeURIComponent(loadHandle)}`, {
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { setLoadMsg(data.error || t("not found", "introuvable")); return; }
      const c = data.creator;
      const vids = Array.isArray(c.video_thumbnails) ? c.video_thumbnails : [];
      setRows([{
        id: counter++,
        handle: c.username || loadHandle,
        displayName: c.display_name || "",
        followers: c.followers ? String(c.followers) : "",
        bio: c.bio || "",
        niches: (c.niches || []).filter((n: string) => n !== "curated").join(", "),
        language: c.language || "fr",
        location: c.location || "France",
        avatarUrl: "",
        currentAvatar: c.avatar_url || "",
        video1: vids[0]?.url || "",
        video2: vids[1]?.url || "",
        video3: vids[2]?.url || "",
        status: "", msg: "",
      }]);
      setLoadMsg(t(`loaded @${c.username}`, `@${c.username} chargé`));
    } catch (e) {
      setLoadMsg(String(e));
    }
  };

  const saveAll = async () => {
    setBusy(true);
    const savedIds: number[] = [];
    const newLog: string[] = [];

    for (const r of rows) {
      if (!r.handle.trim()) {
        setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "err", msg: t("no handle", "pas de pseudo") } : x)));
        continue;
      }
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "saving", msg: "" } : x)));
      try {
        const res = await fetch("/api/admin/add-creator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handle: r.handle, displayName: r.displayName,
            followers: r.followers.trim(), bio: r.bio,
            niches: r.niches, language: r.language, location: r.location,
            avatarUrl: r.avatarUrl,
            videoUrls: [r.video1, r.video2, r.video3].filter(Boolean),
            update: editMode,
            platform,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.ok) {
          savedIds.push(r.id);
          newLog.push(`✅ @${data.username}${data.avatar_stored ? t(" · pfp ✓", " · photo ✓") : ""}`);
        } else {
          const dupMsg = data.duplicate ? t("already in DB — skipped", "déjà en base — ignoré") : (data.error || t("failed", "échec"));
          setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "err", msg: dupMsg } : x)));
        }
      } catch (e) {
        setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "err", msg: String(e) } : x)));
      }
    }

    // Remove saved cards. If none left, leave one fresh empty card.
    setRows((rs) => {
      const remaining = rs.filter((r) => !savedIds.includes(r.id));
      return remaining.length ? remaining : [emptyRow()];
    });
    setSavedTotal((n) => n + savedIds.length);
    setSavedLog((l) => [...newLog, ...l].slice(0, 40));
    setBusy(false);
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", marginBottom: 8,
    border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const label: React.CSSProperties = { fontSize: 11, color: "#777", marginBottom: 3, display: "block" };
  const pending = rows.filter((r) => r.handle.trim()).length;

  return (
    <div className="ad-card" style={{ maxWidth: 640, width: "100%", padding: 24, color: "var(--ad-text)" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4, letterSpacing: "-0.03em" }}>{t("Add creators", "Ajouter des créateurs")}</h1>
      <p style={{ color: "var(--ad-muted)", fontSize: 13, marginBottom: 20 }}>
        {fr ? (
          <>
            Curation manuelle avec votre session d’équipe. Les fiches enregistrées disparaissent une fois en base. Enregistrés pendant cette session : {savedTotal}.
          </>
        ) : (
          <>
            Manual curation with your staff session. Saved cards disappear once they are in the database. Saved this session: {savedTotal}.
          </>
        )}
      </p>


      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setEditMode(false)}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ddd",
            background: !editMode ? "#0047FF" : "#fff", color: !editMode ? "#fff" : "#333",
            fontWeight: 600, cursor: "pointer" }}
        >{t("Add new", "Nouveau")}</button>
        <button
          onClick={() => setEditMode(true)}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ddd",
            background: editMode ? "#0047FF" : "#fff", color: editMode ? "#fff" : "#333",
            fontWeight: 600, cursor: "pointer" }}
        >{t("Edit existing", "Modifier un existant")}</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setPlatform("TikTok")}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ddd",
            background: platform === "TikTok" ? "#111" : "#fff", color: platform === "TikTok" ? "#fff" : "#333",
            fontWeight: 600, cursor: "pointer" }}
        >TikTok</button>
        <button
          onClick={() => setPlatform("Instagram")}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ddd",
            background: platform === "Instagram" ? "#C13584" : "#fff", color: platform === "Instagram" ? "#fff" : "#333",
            fontWeight: 600, cursor: "pointer" }}
        >Instagram</button>
      </div>

      {editMode && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input style={{ ...field, marginBottom: 0 }} value={loadHandle} onChange={(e) => setLoadHandle(e.target.value)} placeholder={t("@handle to edit", "@pseudo à modifier")} />
          <button onClick={loadCreator} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{t("Load", "Charger")}</button>
        </div>
      )}
      {editMode && loadMsg && <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>{loadMsg}</div>}

      {rows.map((r) => (
        <div key={r.id} style={{
          border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 14,
          background: r.status === "err" ? "#fdf3f3" : "#fafafa",
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => removeRow(r.id)} style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", fontSize: 13 }}>{t("remove", "retirer")}</button>
          </div>

          <label style={label}>{t("TikTok handle or URL *", "Pseudo ou URL TikTok *")}</label>
          <input style={field} value={r.handle} onChange={(e) => update(r.id, "handle", e.target.value)} placeholder={t("@username or tiktok.com/@username", "@pseudo ou tiktok.com/@pseudo")} />

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 2 }}>
              <label style={label}>{t("Display name", "Nom affiché")}</label>
              <input style={field} value={r.displayName} onChange={(e) => update(r.id, "displayName", e.target.value)} placeholder={t("Display name", "Nom affiché")} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>{t("Followers", "Abonnés")}</label>
              <input style={field} value={r.followers} onChange={(e) => update(r.id, "followers", e.target.value)} placeholder="45000" inputMode="numeric" />
            </div>
          </div>

          <label style={label}>Bio</label>
          <textarea style={{ ...field, minHeight: 48, resize: "vertical" }} value={r.bio} onChange={(e) => update(r.id, "bio", e.target.value)} placeholder={t("Bio text", "Texte de la bio")} />

          <label style={label}>{t("Niches (comma-separated)", "Niches (séparées par des virgules)")}</label>
          <input style={field} value={r.niches} onChange={(e) => update(r.id, "niches", e.target.value)} placeholder="fitness, gym" />

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>{t("Language", "Langue")}</label>
              <input style={field} value={r.language} onChange={(e) => update(r.id, "language", e.target.value)} placeholder="fr" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>{t("Location", "Localisation")}</label>
              <input style={field} value={r.location} onChange={(e) => update(r.id, "location", e.target.value)} placeholder="France" />
            </div>
          </div>

          <label style={label}>{t("Avatar image URL (optional — stores real pfp)", "URL de la photo de profil (facultatif — enregistre la vraie photo)")}</label>
          <input
            style={field}
            value={r.avatarUrl}
            onChange={(e) => update(r.id, "avatarUrl", e.target.value)}
            placeholder={t("right-click pfp → Copy image address", "clic droit sur la photo → Copier l’adresse de l’image")}
          />
          {r.currentAvatar && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -4, marginBottom: 8 }}>
              <img src={r.currentAvatar} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover", background: "#eee" }} />
              <span style={{ fontSize: 12, color: "#666" }}>
                {t("current pfp — leave blank to keep, paste a new URL to replace", "photo actuelle — laissez vide pour la garder, collez une nouvelle URL pour la remplacer")}
              </span>
            </div>
          )}

          <label style={label}>{t("TikTok video URLs (optional — up to 3, real previews)", "URL de vidéos TikTok (facultatif — jusqu’à 3, vrais aperçus)")}</label>
          <input style={field} value={r.video1} onChange={(e) => update(r.id, "video1", e.target.value)} placeholder="tiktok.com/@user/video/123…" />
          <input style={field} value={r.video2} onChange={(e) => update(r.id, "video2", e.target.value)} placeholder={t("video 2 (optional)", "vidéo 2 (facultatif)")} />
          <input style={field} value={r.video3} onChange={(e) => update(r.id, "video3", e.target.value)} placeholder={t("video 3 (optional)", "vidéo 3 (facultatif)")} />

          {r.status === "saving" && <div style={{ fontSize: 12, color: "#888" }}>{t("saving…", "enregistrement…")}</div>}
          {r.status === "err" && <div style={{ fontSize: 12, color: "#c00" }}>❌ {r.msg}</div>}
        </div>
      ))}

      <button
        onClick={addRow}
        style={{ width: "100%", padding: "10px", background: "#fff", color: "#0047FF",
          border: "1.5px dashed #0047FF", borderRadius: 8, fontSize: 14, fontWeight: 600,
          cursor: "pointer", marginBottom: 12 }}
      >
        {t("+ Add another", "+ En ajouter un autre")}
      </button>

      <button
        onClick={saveAll}
        disabled={busy}
        style={{ width: "100%", padding: "12px", background: busy ? "#999" : "#0047FF",
          color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
          cursor: busy ? "default" : "pointer" }}
      >
        {busy ? t("Saving…", "Enregistrement…") : editMode ? t("Update creator", "Mettre à jour le créateur") : t(`Save all (${pending})`, `Tout enregistrer (${pending})`)}
      </button>

      {editMode && (
        <button
          onClick={deleteCreator}
          style={{ width: "100%", padding: "10px", marginTop: 10, background: "#fff",
            color: "#c00", border: "1px solid #f0c0c0", borderRadius: 8, fontSize: 14,
            fontWeight: 600, cursor: "pointer" }}
        >
          {t("Delete this creator", "Supprimer ce créateur")}
        </button>
      )}

      {savedLog.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>{t("Recently saved", "Enregistrés récemment")}</div>
          {savedLog.map((l, i) => (
            <div key={i} style={{ fontSize: 13, color: "#1a7f37", padding: "3px 0" }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
