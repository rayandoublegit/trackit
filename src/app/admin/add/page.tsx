"use client";

import { useState } from "react";

type Row = {
  handle: string;
  displayName: string;
  followers: string;
  bio: string;
  niches: string;
  language: string;
  location: string;
  avatarUrl: string;
  status: "" | "saving" | "ok" | "err";
  msg: string;
};

const emptyRow = (): Row => ({
  handle: "", displayName: "", followers: "", bio: "",
  niches: "", language: "fr", location: "France",
  avatarUrl: "", status: "", msg: "",
});

export default function AddCreatorPage() {
  const [secret, setSecret] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);

  const update = (i: number, key: keyof Row, val: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  };
  const setRowStatus = (i: number, status: Row["status"], msg: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, status, msg } : r)));
  };

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) => setRows((rs) => rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i));

  const saveAll = async () => {
    setBusy(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.handle.trim()) { if (r.status !== "ok") setRowStatus(i, "err", "no handle"); continue; }
      if (r.status === "ok") continue;
      setRowStatus(i, "saving", "");
      try {
        const res = await fetch("/api/admin/add-creator", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            handle: r.handle, displayName: r.displayName,
            followers: Number(r.followers) || 0, bio: r.bio,
            niches: r.niches, language: r.language, location: r.location,
            avatarUrl: r.avatarUrl,
          }),
        });
        const data = await res.json();
        if (data.ok) setRowStatus(i, "ok", `@${data.username}${data.avatar_stored ? " · pfp ✓" : ""}`);
        else setRowStatus(i, "err", data.error || "failed");
      } catch (e) {
        setRowStatus(i, "err", String(e));
      }
    }
    setBusy(false);
    setRows((rs) => [...rs, emptyRow()]);
  };

  const clearSaved = () => setRows((rs) => {
    const remaining = rs.filter((r) => r.status !== "ok");
    return remaining.length ? remaining : [emptyRow()];
  });

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", marginBottom: 8,
    border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const label: React.CSSProperties = { fontSize: 11, color: "#777", marginBottom: 3, display: "block" };
  const savedCount = rows.filter((r) => r.status === "ok").length;
  const pending = rows.filter((r) => r.handle.trim() && r.status !== "ok").length;

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Add Creators (manual)</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
        Curate by hand. Add as many as you want, then save the whole batch. Saved {savedCount} this session.
      </p>

      <label style={label}>Admin secret</label>
      <input style={field} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="admin secret" />

      {rows.map((r, i) => (
        <div key={i} style={{
          border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 14,
          background: r.status === "ok" ? "#f3fdf6" : r.status === "err" ? "#fdf3f3" : "#fafafa",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#999" }}>#{i + 1}</span>
            {rows.length > 1 && (
              <button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", fontSize: 13 }}>remove</button>
            )}
          </div>

          <label style={label}>TikTok handle or URL *</label>
          <input style={field} value={r.handle} onChange={(e) => update(i, "handle", e.target.value)} placeholder="@username or tiktok.com/@username" />

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 2 }}>
              <label style={label}>Display name</label>
              <input style={field} value={r.displayName} onChange={(e) => update(i, "displayName", e.target.value)} placeholder="Display name" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Followers</label>
              <input style={field} value={r.followers} onChange={(e) => update(i, "followers", e.target.value)} placeholder="45000" inputMode="numeric" />
            </div>
          </div>

          <label style={label}>Bio</label>
          <textarea style={{ ...field, minHeight: 48, resize: "vertical" }} value={r.bio} onChange={(e) => update(i, "bio", e.target.value)} placeholder="Bio text" />

          <label style={label}>Niches (comma-separated)</label>
          <input style={field} value={r.niches} onChange={(e) => update(i, "niches", e.target.value)} placeholder="fitness, musculation" />

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Language</label>
              <input style={field} value={r.language} onChange={(e) => update(i, "language", e.target.value)} placeholder="fr" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Location</label>
              <input style={field} value={r.location} onChange={(e) => update(i, "location", e.target.value)} placeholder="France" />
            </div>
          </div>

          <label style={label}>Avatar image URL (optional — stores real pfp)</label>
          <input style={field} value={r.avatarUrl} onChange={(e) => update(i, "avatarUrl", e.target.value)} placeholder="right-click pfp → Copy image address" />

          {r.status === "saving" && <div style={{ fontSize: 12, color: "#888" }}>saving…</div>}
          {r.status === "ok" && <div style={{ fontSize: 12, color: "#1a7f37" }}>✅ {r.msg}</div>}
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
        {busy ? "Saving batch…" : `Save all (${pending})`}
      </button>

      {savedCount > 0 && (
        <button
          onClick={clearSaved}
          style={{ width: "100%", padding: "8px", background: "none", color: "#888",
            border: "none", fontSize: 13, cursor: "pointer", marginTop: 8 }}
        >
          clear {savedCount} saved from list
        </button>
      )}
    </div>
  );
}
