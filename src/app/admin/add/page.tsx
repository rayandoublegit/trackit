"use client";

import { useState } from "react";

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
  avatarUrl: "", video1: "", video2: "", video3: "", status: "", msg: "",
});

export default function AddCreatorPage() {
  const [secret, setSecret] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [loadHandle, setLoadHandle] = useState("");
  const [loadMsg, setLoadMsg] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [savedTotal, setSavedTotal] = useState(0);
  const [savedLog, setSavedLog] = useState<string[]>([]);

  const update = (id: number, key: keyof Row, val: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  };

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (id: number) =>
    setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((r) => r.id !== id)));

  const deleteCreator = async () => {
    const h = (rows[0]?.handle || loadHandle).trim();
    if (!h) { setLoadMsg("load a creator first"); return; }
    if (!window.confirm(`Delete @${h.replace(/^@/, "")} permanently?`)) return;
    setLoadMsg("deleting…");
    try {
      const res = await fetch(`/api/admin/add-creator?handle=${encodeURIComponent(h)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (!data.ok) { setLoadMsg(data.error || "delete failed"); return; }
      setLoadMsg(`deleted @${data.deleted}`);
      setRows([emptyRow()]);
      setLoadHandle("");
    } catch (e) {
      setLoadMsg(String(e));
    }
  };

  const loadCreator = async () => {
    if (!loadHandle.trim()) { setLoadMsg("enter a handle"); return; }
    setLoadMsg("loading…");
    try {
      const res = await fetch(`/api/admin/add-creator?handle=${encodeURIComponent(loadHandle)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (!data.ok) { setLoadMsg(data.error || "not found"); return; }
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
        video1: vids[0]?.url || "",
        video2: vids[1]?.url || "",
        video3: vids[2]?.url || "",
        status: "", msg: "",
      }]);
      setLoadMsg(`loaded @${c.username}`);
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
        setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "err", msg: "no handle" } : x)));
        continue;
      }
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "saving", msg: "" } : x)));
      try {
        const res = await fetch("/api/admin/add-creator", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            handle: r.handle, displayName: r.displayName,
            followers: Number(r.followers) || 0, bio: r.bio,
            niches: r.niches, language: r.language, location: r.location,
            avatarUrl: r.avatarUrl,
            videoUrls: [r.video1, r.video2, r.video3].filter(Boolean),
            update: editMode,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          savedIds.push(r.id);
          newLog.push(`✅ @${data.username}${data.avatar_stored ? " · pfp ✓" : ""}`);
        } else {
          const dupMsg = data.duplicate ? "already in DB — skipped" : (data.error || "failed");
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
    <div style={{ maxWidth: 560, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Add Creators (manual)</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
        Curate by hand. Saved cards disappear once they&apos;re in the DB. Total saved this session: {savedTotal}.
      </p>

      <label style={label}>Admin secret</label>
      <input style={field} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="admin secret" />

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setEditMode(false)}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ddd",
            background: !editMode ? "#0047FF" : "#fff", color: !editMode ? "#fff" : "#333",
            fontWeight: 600, cursor: "pointer" }}
        >Add new</button>
        <button
          onClick={() => setEditMode(true)}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ddd",
            background: editMode ? "#0047FF" : "#fff", color: editMode ? "#fff" : "#333",
            fontWeight: 600, cursor: "pointer" }}
        >Edit existing</button>
      </div>

      {editMode && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input style={{ ...field, marginBottom: 0 }} value={loadHandle} onChange={(e) => setLoadHandle(e.target.value)} placeholder="@handle to edit" />
          <button onClick={loadCreator} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Load</button>
        </div>
      )}
      {editMode && loadMsg && <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>{loadMsg}</div>}

      {rows.map((r) => (
        <div key={r.id} style={{
          border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 14,
          background: r.status === "err" ? "#fdf3f3" : "#fafafa",
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => removeRow(r.id)} style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", fontSize: 13 }}>remove</button>
          </div>

          <label style={label}>TikTok handle or URL *</label>
          <input style={field} value={r.handle} onChange={(e) => update(r.id, "handle", e.target.value)} placeholder="@username or tiktok.com/@username" />

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 2 }}>
              <label style={label}>Display name</label>
              <input style={field} value={r.displayName} onChange={(e) => update(r.id, "displayName", e.target.value)} placeholder="Display name" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Followers</label>
              <input style={field} value={r.followers} onChange={(e) => update(r.id, "followers", e.target.value)} placeholder="45000" inputMode="numeric" />
            </div>
          </div>

          <label style={label}>Bio</label>
          <textarea style={{ ...field, minHeight: 48, resize: "vertical" }} value={r.bio} onChange={(e) => update(r.id, "bio", e.target.value)} placeholder="Bio text" />

          <label style={label}>Niches (comma-separated)</label>
          <input style={field} value={r.niches} onChange={(e) => update(r.id, "niches", e.target.value)} placeholder="fitness, musculation" />

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Language</label>
              <input style={field} value={r.language} onChange={(e) => update(r.id, "language", e.target.value)} placeholder="fr" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Location</label>
              <input style={field} value={r.location} onChange={(e) => update(r.id, "location", e.target.value)} placeholder="France" />
            </div>
          </div>

          <label style={label}>Avatar image URL (optional — stores real pfp)</label>
          <input style={field} value={r.avatarUrl} onChange={(e) => update(r.id, "avatarUrl", e.target.value)} placeholder="right-click pfp → Copy image address" />

          <label style={label}>TikTok video URLs (optional — up to 3, real previews)</label>
          <input style={field} value={r.video1} onChange={(e) => update(r.id, "video1", e.target.value)} placeholder="tiktok.com/@user/video/123…" />
          <input style={field} value={r.video2} onChange={(e) => update(r.id, "video2", e.target.value)} placeholder="video 2 (optional)" />
          <input style={field} value={r.video3} onChange={(e) => update(r.id, "video3", e.target.value)} placeholder="video 3 (optional)" />

          {r.status === "saving" && <div style={{ fontSize: 12, color: "#888" }}>saving…</div>}
          {r.status === "err" && <div style={{ fontSize: 12, color: "#c00" }}>❌ {r.msg}</div>}
        </div>
      ))}

      <button
        onClick={addRow}
        style={{ width: "100%", padding: "10px", background: "#fff", color: "#0047FF",
          border: "1.5px dashed #0047FF", borderRadius: 8, fontSize: 14, fontWeight: 600,
          cursor: "pointer", marginBottom: 12 }}
      >
        + Add another
      </button>

      <button
        onClick={saveAll}
        disabled={busy}
        style={{ width: "100%", padding: "12px", background: busy ? "#999" : "#0047FF",
          color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
          cursor: busy ? "default" : "pointer" }}
      >
        {busy ? "Saving…" : editMode ? "Update creator" : `Save all (${pending})`}
      </button>

      {editMode && (
        <button
          onClick={deleteCreator}
          style={{ width: "100%", padding: "10px", marginTop: 10, background: "#fff",
            color: "#c00", border: "1px solid #f0c0c0", borderRadius: 8, fontSize: 14,
            fontWeight: 600, cursor: "pointer" }}
        >
          Delete this creator
        </button>
      )}

      {savedLog.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>Recently saved</div>
          {savedLog.map((l, i) => (
            <div key={i} style={{ fontSize: 13, color: "#1a7f37", padding: "3px 0" }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
