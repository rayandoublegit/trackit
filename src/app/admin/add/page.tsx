"use client";

import { useState } from "react";

export default function AddCreatorPage() {
  const [secret, setSecret] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [followers, setFollowers] = useState("");
  const [bio, setBio] = useState("");
  const [niches, setNiches] = useState("");
  const [language, setLanguage] = useState("fr");
  const [location, setLocation] = useState("France");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (m: string) => setLog((l) => [m, ...l].slice(0, 30));

  const reset = () => {
    setHandle(""); setDisplayName(""); setFollowers(""); setBio("");
    setNiches(""); setAvatarUrl("");
    // keep language/location — usually adding a batch from same market
  };

  const submit = async () => {
    if (!handle.trim()) { addLog("⚠️ handle required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/add-creator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          handle, displayName, followers: Number(followers) || 0,
          bio, niches, language, location, avatarUrl,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        addLog(`✅ @${data.username}${data.avatar_stored ? " (pfp stored)" : ""}`);
        reset();
      } else {
        addLog(`❌ ${data.error || "failed"}`);
      }
    } catch (e) {
      addLog(`❌ ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "10px 12px", marginBottom: 10,
    border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const label: React.CSSProperties = { fontSize: 12, color: "#666", marginBottom: 4, display: "block" };

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Add Creator (manual)</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
        Curate creators by hand. Paste what you see on their TikTok profile.
      </p>

      <label style={label}>Admin secret</label>
      <input style={field} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="admin secret" />

      <label style={label}>TikTok handle or URL *</label>
      <input style={field} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@username or tiktok.com/@username" />

      <label style={label}>Display name</label>
      <input style={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Their display name" />

      <label style={label}>Followers</label>
      <input style={field} value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="e.g. 45000" inputMode="numeric" />

      <label style={label}>Bio</label>
      <textarea style={{ ...field, minHeight: 60, resize: "vertical" }} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Their bio text" />

      <label style={label}>Niches (comma-separated)</label>
      <input style={field} value={niches} onChange={(e) => setNiches(e.target.value)} placeholder="fitness, musculation" />

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Language</label>
          <input style={field} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="fr / en / de" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Location</label>
          <input style={field} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="France" />
        </div>
      </div>

      <label style={label}>Avatar image URL (optional — stores their real pfp permanently)</label>
      <input style={field} value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="right-click their pfp → Copy image address" />

      <button
        onClick={submit}
        disabled={busy}
        style={{
          width: "100%", padding: "12px", background: busy ? "#999" : "#0047FF",
          color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
          cursor: busy ? "default" : "pointer", marginTop: 6,
        }}
      >
        {busy ? "Saving..." : "Save creator"}
      </button>

      <div style={{ marginTop: 24 }}>
        {log.map((l, i) => (
          <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>{l}</div>
        ))}
      </div>
    </div>
  );
}
