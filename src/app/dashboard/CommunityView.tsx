"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { getLastCommunityId, rememberLastCommunityId } from "@/lib/last-community-storage";

type CommunityRow = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  members_can_post: boolean;
  memberCount?: number;
  brandName?: string;
  role?: string;
  canPost?: boolean;
};

type MemberRow = {
  userId: string;
  role: string;
  canPost: boolean;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

type MessageRow = {
  id: string;
  body: string | null;
  imageUrl: string | null;
  replyToId: string | null;
  mentions: string[];
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  replyPreview: {
    id: string;
    body: string | null;
    authorId: string;
    authorName?: string;
    imageUrl?: string | null;
  } | null;
};

type CreatorOption = {
  userId: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
};

type Screen = "list" | "create" | "chat" | "settings";

const fieldInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid var(--ws-border)",
  fontSize: 15,
  fontFamily: "inherit",
  color: "var(--ws-text)",
  letterSpacing: "-0.02em",
  background: "var(--ws-input)",
  outline: "none",
};

const primaryBtn: CSSProperties = {
  background: "var(--ws-accent)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const secondaryBtn: CSSProperties = {
  background: "var(--ws-surface)",
  color: "var(--ws-text)",
  border: "1px solid var(--ws-border)",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

function mediaKindFromUrl(url: string | null | undefined): "image" | "audio" | "video" | null {
  if (!url) return null;
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(clean)) return "audio";
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(clean)) return "image";
  return "image";
}

function formatBubbleTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function replySnippet(
  preview: MessageRow["replyPreview"],
  fr: boolean,
): string {
  if (!preview) return "";
  if (preview.body?.trim()) return preview.body.trim();
  if (preview.imageUrl) return fr ? "Photo" : "Photo";
  return fr ? "Message" : "Message";
}

function renderBody(text: string | null) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9._]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") && part.length > 1 ? (
      <span key={i} className="cm-mention">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function CommunityView({
  userId,
  isMobile,
  isCreator,
  initialCommunityId,
  onCommunityChange,
}: {
  userId?: string;
  isMobile?: boolean;
  isCreator?: boolean;
  initialCommunityId?: string | null;
  onCommunityChange?: (id: string | null) => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const pagePad = isMobile ? "20px 16px 48px" : "28px 28px 56px";
  const contentMax = 720;

  const [screen, setScreen] = useState<Screen>("list");
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommunityRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [canPost, setCanPost] = useState(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [sending, setSending] = useState(false);
  const [creatorOptions, setCreatorOptions] = useState<CreatorOption[]>([]);
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"image" | "audio" | "video" | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);
  const messageFileRef = useRef<HTMLInputElement>(null);
  const attachWrapRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingLockRef = useRef(false);
  const pendingPreviewRef = useRef<string | null>(null);

  const [createStep, setCreateStep] = useState<0 | 1>(0);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createAvatar, setCreateAvatar] = useState<string | null>(null);
  const [createMembersCanPost, setCreateMembersCanPost] = useState(true);
  const [creating, setCreating] = useState(false);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editMembersCanPost, setEditMembersCanPost] = useState(true);
  const [addUserId, setAddUserId] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadCommunities = useCallback(async (opts?: { preferId?: string | null; openChat?: boolean }) => {
    if (!userId) {
      setCommunities([]);
      setLoading(false);
      return [] as CommunityRow[];
    }
    setLoading(true);
    setError("");
    try {
      const url = isCreator
        ? `/api/creator/communities?userId=${encodeURIComponent(userId)}`
        : `/api/communities?brandId=${encodeURIComponent(userId)}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Chargement impossible" : "Could not load"));
        setCommunities([]);
        return [];
      }
      const rows = (data.communities || []) as CommunityRow[];
      setCommunities(rows);
      const preferred =
        opts?.preferId ||
        initialCommunityId ||
        getLastCommunityId(userId) ||
        rows[0]?.id ||
        null;
      const next = preferred && rows.some((c) => c.id === preferred) ? preferred : rows[0]?.id || null;
      setActiveId(next);
      if (next) {
        rememberLastCommunityId(userId, next);
        onCommunityChange?.(next);
        if (opts?.openChat !== false && screen !== "create") setScreen("chat");
      } else {
        onCommunityChange?.(null);
      }
      return rows;
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId, isCreator, fr, initialCommunityId, onCommunityChange, screen]);

  const loadDetail = useCallback(
    async (communityId: string) => {
      const res = await fetch(`/api/communities/${communityId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Impossible d’ouvrir la communauté" : "Could not open community"));
        return;
      }
      setDetail(data.community as CommunityRow);
      setMembers((data.members || []) as MemberRow[]);
      setCanPost(Boolean(data.membership?.canPost));
      setEditName(data.community?.name || "");
      setEditDesc(data.community?.description || "");
      setEditMembersCanPost(data.community?.members_can_post !== false);
    },
    [fr],
  );

  const loadMessages = useCallback(async (communityId: string) => {
    try {
      const res = await fetch(`/api/communities/${communityId}/messages?limit=100`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Impossible de charger les messages" : "Could not load messages"));
        return;
      }
      setMessages((data.messages || []) as MessageRow[]);
      if (typeof data.canPost === "boolean") setCanPost(data.canPost);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError(fr ? "Erreur réseau (messages)" : "Network error (messages)");
    }
  }, [fr]);

  const loadCreators = useCallback(async () => {
    if (isCreator || !userId) return;
    try {
      const res = await fetch(`/api/creators?userId=${encodeURIComponent(userId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => []);
      const rows = (Array.isArray(data) ? data : data.creators || data.items || []) as {
        linked_user_id?: string | null;
        full_name?: string | null;
        handle?: string | null;
        avatar_url?: string | null;
      }[];
      setCreatorOptions(
        rows
          .filter((r) => r.linked_user_id)
          .map((r) => ({
            userId: String(r.linked_user_id),
            name: r.full_name || (r.handle ? `@${r.handle}` : "Creator"),
            handle: (r.handle || "").replace(/^@/, ""),
            avatarUrl: r.avatar_url || null,
          })),
      );
    } catch {
      setCreatorOptions([]);
    }
  }, [isCreator, userId]);

  useEffect(() => {
    void loadCommunities();
  }, [userId, isCreator]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onCreate = () => {
      if (!isCreator) startCreate();
    };
    const onSelect = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) openCommunity(id);
    };
    window.addEventListener("trackit:community-create", onCreate);
    window.addEventListener("trackit:community-select", onSelect);
    return () => {
      window.removeEventListener("trackit:community-create", onCreate);
      window.removeEventListener("trackit:community-select", onSelect);
    };
  }, [isCreator]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId || screen === "create" || screen === "settings") return;
    void loadDetail(activeId);
    void loadMessages(activeId);
    const t = window.setInterval(() => void loadMessages(activeId), 3000);
    const onFocus = () => void loadMessages(activeId);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeId, screen, loadDetail, loadMessages]);

  useEffect(() => {
    if (!isCreator) void loadCreators();
  }, [isCreator, loadCreators]);

  const openCommunity = (id: string) => {
    setActiveId(id);
    rememberLastCommunityId(userId, id);
    onCommunityChange?.(id);
    setScreen("chat");
    setReplyTo(null);
    setDraft("");
    setError("");
    clearPending();
  };

  const startCreate = () => {
    setCreateStep(0);
    setCreateName("");
    setCreateDesc("");
    setCreateAvatar(null);
    setCreateMembersCanPost(true);
    setSelectedCreatorIds([]);
    setError("");
    setScreen("create");
    void loadCreators();
  };

  const uploadImage = async (file: File, folder: string) => {
    if (!supabase || !userId) throw new Error(fr ? "Stockage indisponible" : "Storage unavailable");
    const path = `${userId}/${folder}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_").slice(0, 80)}`;
    const { error: upErr } = await supabase.storage.from("community-media").upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabase.storage.from("community-media").getPublicUrl(path);
    return pub.publicUrl;
  };

  const submitCreate = async () => {
    if (!userId || !createName.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: userId,
          name: createName.trim(),
          description: createDesc.trim(),
          avatarUrl: createAvatar,
          membersCanPost: createMembersCanPost,
          memberUserIds: selectedCreatorIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Création impossible" : "Could not create"));
        return;
      }
      const newId = data.community?.id as string | undefined;
      window.dispatchEvent(new Event("trackit:communities-updated"));
      await loadCommunities({ preferId: newId, openChat: true });
      if (newId) openCommunity(newId);
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setCreating(false);
    }
  };

  const parseMentions = (text: string) => {
    const ids: string[] = [];
    for (const m of members) {
      if (!m.username) continue;
      if (new RegExp(`@${m.username}\\b`, "i").test(text)) ids.push(m.userId);
    }
    return ids;
  };

  const clearPending = useCallback(() => {
    if (pendingPreviewRef.current) {
      URL.revokeObjectURL(pendingPreviewRef.current);
      pendingPreviewRef.current = null;
    }
    setPendingFile(null);
    setPendingPreview(null);
    setPendingKind(null);
  }, []);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (attachWrapRef.current && !attachWrapRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [attachMenuOpen]);

  useEffect(() => {
    return () => {
      if (pendingPreviewRef.current) URL.revokeObjectURL(pendingPreviewRef.current);
    };
  }, []);

  const openAttachPicker = (kind: "image" | "audio" | "video") => {
    setAttachMenuOpen(false);
    const input = messageFileRef.current;
    if (!input) return;
    if (kind === "image") input.accept = "image/*";
    else if (kind === "audio") input.accept = "audio/*";
    else input.accept = "video/*";
    input.click();
  };

  const onPickAttachment = (file: File | null) => {
    if (!file) return;
    if (pendingPreviewRef.current) URL.revokeObjectURL(pendingPreviewRef.current);
    const kind: "image" | "audio" | "video" =
      file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "image";
    const preview = URL.createObjectURL(file);
    pendingPreviewRef.current = preview;
    setPendingKind(kind);
    setPendingFile(file);
    setPendingPreview(preview);
  };

  const sendMessage = async () => {
    if (!activeId || sendingLockRef.current) return;
    const text = draft.trim();
    const file = pendingFile;
    if (!text && !file) return;
    if (!canPost) {
      setError(fr ? "Vous ne pouvez pas répondre dans cette communauté." : "You cannot reply in this community.");
      return;
    }
    sendingLockRef.current = true;
    setSending(true);
    setError("");
    const communityId = activeId;
    const replySnapshot = replyTo;
    try {
      let mediaUrl: string | null = null;
      if (file) {
        mediaUrl = await uploadImage(file, `messages/${communityId}`);
      }
      const res = await fetch(`/api/communities/${communityId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text || null,
          imageUrl: mediaUrl,
          replyToId: replySnapshot?.id || null,
          mentions: parseMentions(text),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Envoi impossible" : "Could not send"));
        return;
      }

      const created = data.message as
        | {
            id: string;
            body: string | null;
            imageUrl?: string | null;
            image_url?: string | null;
            replyToId?: string | null;
            reply_to_id?: string | null;
            mentions?: string[];
            createdAt?: string;
            created_at?: string;
            authorId?: string;
            author_id?: string;
            authorName?: string;
            authorAvatar?: string | null;
            replyPreview?: MessageRow["replyPreview"];
          }
        | undefined;

      if (created?.id) {
        const row: MessageRow = {
          id: created.id,
          body: created.body ?? (text || null),
          imageUrl: created.imageUrl ?? created.image_url ?? mediaUrl,
          replyToId: created.replyToId ?? created.reply_to_id ?? replySnapshot?.id ?? null,
          mentions: created.mentions || parseMentions(text),
          createdAt: created.createdAt || created.created_at || new Date().toISOString(),
          authorId: created.authorId || created.author_id || userId || "",
          authorName: created.authorName || (fr ? "Vous" : "You"),
          authorAvatar: created.authorAvatar ?? null,
          replyPreview: created.replyPreview
            ? created.replyPreview
            : replySnapshot
              ? {
                  id: replySnapshot.id,
                  body: replySnapshot.body,
                  authorId: replySnapshot.authorId,
                  authorName: replySnapshot.authorName,
                  imageUrl: replySnapshot.imageUrl,
                }
              : null,
        };
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      }

      setDraft("");
      setReplyTo(null);
      clearPending();
      void loadMessages(communityId);
    } catch (e) {
      setError((e as Error).message || (fr ? "Erreur réseau" : "Network error"));
    } finally {
      sendingLockRef.current = false;
      setSending(false);
    }
  };

  const saveSettings = async () => {
    if (!activeId || savingSettings) return;
    setSavingSettings(true);
    setError("");
    try {
      const res = await fetch(`/api/communities/${activeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          membersCanPost: editMembersCanPost,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Enregistrement impossible" : "Could not save"));
        return;
      }
      setDetail(data.community);
      window.dispatchEvent(new Event("trackit:communities-updated"));
      await loadCommunities({ preferId: activeId, openChat: false });
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setSavingSettings(false);
    }
  };

  const addMember = async () => {
    if (!activeId || !addUserId) return;
    const res = await fetch(`/api/communities/${activeId}/members`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addUserId, role: "member", canPost: editMembersCanPost }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || (fr ? "Ajout impossible" : "Could not add"));
      return;
    }
    setAddUserId("");
    await loadDetail(activeId);
    window.dispatchEvent(new Event("trackit:communities-updated"));
  };

  const updateMember = async (userIdToUpdate: string, patch: { role?: string; canPost?: boolean }) => {
    if (!activeId) return;
    await fetch(`/api/communities/${activeId}/members`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userIdToUpdate, ...patch }),
    });
    await loadDetail(activeId);
  };

  const removeMember = async (userIdToRemove: string) => {
    if (!activeId) return;
    await fetch(
      `/api/communities/${activeId}/members?userId=${encodeURIComponent(userIdToRemove)}`,
      { method: "DELETE", credentials: "include" },
    );
    await loadDetail(activeId);
    window.dispatchEvent(new Event("trackit:communities-updated"));
  };

  const mentionCandidates = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.username || m.name)
      .filter((m) => {
        const hay = `${m.username || ""} ${m.name}`.toLowerCase();
        return !q || hay.includes(q);
      })
      .slice(0, 6);
  }, [mentionOpen, mentionQuery, members]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const at = value.lastIndexOf("@");
    if (at >= 0 && (at === 0 || /\s/.test(value[at - 1] || ""))) {
      const q = value.slice(at + 1);
      if (!/\s/.test(q)) {
        setMentionOpen(true);
        setMentionQuery(q);
        return;
      }
    }
    setMentionOpen(false);
    setMentionQuery("");
  };

  const insertMention = (member: MemberRow) => {
    const handle = member.username || member.name.replace(/\s+/g, "");
    const at = draft.lastIndexOf("@");
    setDraft(`${draft.slice(0, at)}@${handle} `);
    setMentionOpen(false);
  };

  const toggleCreator = (id: string) => {
    setSelectedCreatorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (loading && screen !== "create") {
    return (
      <div className={`cm-page${isMobile ? " is-mobile" : ""}`}>
        <p className="cm-empty">{fr ? "Chargement…" : "Loading…"}</p>
      </div>
    );
  }

  if (screen === "create" && !isCreator) {
    return (
      <div style={{ minHeight: "100%", background: "var(--ws-bg)", color: "var(--ws-text)", padding: pagePad, fontFamily: "inherit" }}>
        <div style={{ maxWidth: contentMax, margin: "0 auto" }}>
          {createStep === 0 ? (
            <>
              <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 600, margin: "0 0 36px", letterSpacing: "-0.03em" }}>
                {fr ? "Créer une communauté" : "Create a community"}
              </h1>

              {error ? <p style={{ color: "#f97316", fontSize: 13.5, margin: "0 0 16px" }}>{error}</p> : null}

              <div style={{ marginBottom: 28 }}>
                <div
                  style={{
                    border: "1px solid var(--ws-accent)",
                    borderRadius: 10,
                    padding: "4px 14px",
                    background: "var(--ws-input)",
                    boxShadow: "0 0 0 1px var(--ws-accent-soft)",
                  }}
                >
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={fr ? "Nommez votre communauté" : "Name your community"}
                    autoFocus
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      fontSize: 15,
                      fontFamily: "inherit",
                      padding: "12px 0",
                      background: "transparent",
                      color: "var(--ws-text)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                  {fr ? "Photo de profil" : "Profile photo"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    className="cm-avatar"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 18,
                      ...(createAvatar ? { backgroundImage: `url(${createAvatar})` } : {}),
                    }}
                  >
                    {!createAvatar ? (createName.slice(0, 1).toUpperCase() || "C") : null}
                  </div>
                  <button type="button" style={secondaryBtn} onClick={() => createFileRef.current?.click()}>
                    {fr ? "Uploader une photo" : "Upload a photo"}
                  </button>
                  <input
                    ref={createFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void uploadImage(file, "avatars")
                        .then(setCreateAvatar)
                        .catch((err) => setError((err as Error).message));
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                  {fr ? "Description" : "Description"}
                </div>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder={fr ? "À quoi sert cette communauté ?" : "What is this community for?"}
                  style={{ ...fieldInput, minHeight: 140, resize: "vertical", lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 36 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={createMembersCanPost}
                    onChange={(e) => setCreateMembersCanPost(e.target.checked)}
                    style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--ws-accent)" }}
                  />
                  <span style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>
                    {fr
                      ? "Autoriser les membres à répondre aux messages"
                      : "Allow members to reply to messages"}
                    <span style={{ display: "block", marginTop: 4, fontSize: 12.5, color: "var(--ws-text-muted)" }}>
                      {fr
                        ? "Sinon, seuls le propriétaire et les admins peuvent poster."
                        : "Otherwise only the owner and admins can post."}
                    </span>
                  </span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={primaryBtn}
                  disabled={!createName.trim()}
                  onClick={() => setCreateStep(1)}
                >
                  {fr ? "Sélectionner des créateurs pour démarrer" : "Select creators to start"}
                </button>
                <button
                  type="button"
                  style={secondaryBtn}
                  onClick={() => setScreen(communities.length ? "chat" : "list")}
                >
                  {fr ? "Annuler" : "Cancel"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
                {fr ? "Sélectionner des créateurs" : "Select creators"}
              </h1>
              <p style={{ fontSize: 15, margin: "0 0 28px", lineHeight: 1.5 }}>
                {fr
                  ? `Ajoutez des créateurs avec un dashboard actif à « ${createName} ». Ils verront tous les messages de la communauté.`
                  : `Add creators with an active dashboard to “${createName}”. They will see every community message.`}
              </p>

              {error ? <p style={{ color: "#f97316", fontSize: 13.5, margin: "0 0 16px" }}>{error}</p> : null}

              {creatorOptions.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--ws-text-muted)", marginBottom: 24 }}>
                  {fr
                    ? "Aucun créateur avec dashboard lié. Invitez d’abord un créateur, puis revenez ici."
                    : "No creators with a linked dashboard. Invite a creator first, then come back."}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                  {creatorOptions.map((c) => {
                    const checked = selectedCreatorIds.includes(c.userId);
                    return (
                      <label
                        key={c.userId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 14px",
                          border: `1px solid ${checked ? "var(--ws-accent)" : "var(--ws-border)"}`,
                          borderRadius: 10,
                          background: checked ? "var(--ws-accent-soft, #eef3ff)" : "var(--ws-surface-2)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCreator(c.userId)}
                          style={{ width: 16, height: 16, accentColor: "var(--ws-accent)" }}
                        />
                        <span
                          className="cm-avatar sm"
                          style={c.avatarUrl ? { backgroundImage: `url(${c.avatarUrl})` } : undefined}
                        >
                          {!c.avatarUrl ? c.name.slice(0, 1).toUpperCase() : null}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: 14 }}>{c.name}</strong>
                          <span style={{ fontSize: 13, color: "var(--ws-text-muted)" }}>
                            {c.handle ? `@${c.handle}` : fr ? "Dashboard créateur" : "Creator dashboard"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 20, color: "var(--ws-text-muted)" }}>
                {selectedCreatorIds.length === 0
                  ? fr
                    ? "Aucun créateur sélectionné (vous pourrez en ajouter plus tard)"
                    : "No creators selected (you can add more later)"
                  : fr
                    ? `${selectedCreatorIds.length} créateur${selectedCreatorIds.length > 1 ? "s" : ""} sélectionné${selectedCreatorIds.length > 1 ? "s" : ""}`
                    : `${selectedCreatorIds.length} creator${selectedCreatorIds.length > 1 ? "s" : ""} selected`}
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="button" style={primaryBtn} disabled={creating || !createName.trim()} onClick={() => void submitCreate()}>
                  {creating
                    ? "…"
                    : fr
                      ? "Créer la communauté"
                      : "Create community"}
                </button>
                <button type="button" style={secondaryBtn} onClick={() => setCreateStep(0)} disabled={creating}>
                  {fr ? "Retour" : "Back"}
                </button>
                <button
                  type="button"
                  style={secondaryBtn}
                  onClick={() => setScreen(communities.length ? "chat" : "list")}
                  disabled={creating}
                >
                  {fr ? "Annuler" : "Cancel"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (screen === "settings" && detail && !isCreator) {
    return (
      <div className={`cm-page${isMobile ? " is-mobile" : ""}`}>
        <div className="cm-settings">
          <button type="button" className="cm-back" onClick={() => setScreen("chat")}>
            ← {fr ? "Retour au chat" : "Back to chat"}
          </button>
          <h1 className="cm-title">{fr ? "Configuration" : "Settings"}</h1>
          {error ? <p className="cm-error">{error}</p> : null}

          <div className="cm-panel">
            <label className="cm-label">{fr ? "Nom" : "Name"}</label>
            <input className="cm-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <label className="cm-label">{fr ? "Description" : "Description"}</label>
            <textarea className="cm-input cm-textarea" rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            <label className="cm-check">
              <input
                type="checkbox"
                checked={editMembersCanPost}
                onChange={(e) => setEditMembersCanPost(e.target.checked)}
              />
              {fr ? "Les membres peuvent répondre" : "Members can reply"}
            </label>
            <button type="button" className="cm-btn" disabled={savingSettings} onClick={() => void saveSettings()}>
              {savingSettings ? "…" : fr ? "Enregistrer" : "Save"}
            </button>
          </div>

          <div className="cm-panel">
            <h2 className="cm-section-title">{fr ? "Ajouter un créateur" : "Add a creator"}</h2>
            <select className="cm-input" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
              <option value="">{fr ? "Choisir…" : "Choose…"}</option>
              {creatorOptions
                .filter((c) => !members.some((m) => m.userId === c.userId))
                .map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.name}
                    {c.handle ? ` (@${c.handle})` : ""}
                  </option>
                ))}
            </select>
            <button type="button" className="cm-btn" disabled={!addUserId} onClick={() => void addMember()} style={{ marginTop: 10 }}>
              {fr ? "Ajouter" : "Add"}
            </button>
          </div>

          <div className="cm-panel">
            <h2 className="cm-section-title">{fr ? "Membres & rôles" : "Members & roles"}</h2>
            <ul className="cm-member-list">
              {members.map((m) => (
                <li key={m.userId}>
                  <div className="cm-member-main">
                    <strong>{m.name}</strong>
                    <span>{m.role}</span>
                  </div>
                  {m.role !== "owner" ? (
                    <div className="cm-member-actions">
                      <select
                        value={m.role}
                        onChange={(e) => void updateMember(m.userId, { role: e.target.value })}
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                      <label className="cm-check compact">
                        <input
                          type="checkbox"
                          checked={m.canPost}
                          onChange={(e) => void updateMember(m.userId, { canPost: e.target.checked })}
                        />
                        {fr ? "Répondre" : "Reply"}
                      </label>
                      <button type="button" className="cm-link-danger" onClick={() => void removeMember(m.userId)}>
                        {fr ? "Retirer" : "Remove"}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`cm-page cm-page--full${isMobile ? " is-mobile" : ""}`}>
      <section className="cm-chat cm-chat--full">
        {!activeId || !detail ? (
          <div className="cm-empty-block">
            <p>
              {communities.length === 0
                ? isCreator
                  ? fr
                    ? "Aucune communauté pour l’instant."
                    : "No communities yet."
                  : fr
                    ? "Créez votre première communauté depuis la barre latérale."
                    : "Create your first community from the sidebar."
                : fr
                  ? "Sélectionnez une communauté dans la barre latérale."
                  : "Select a community in the sidebar."}
            </p>
            {!isCreator && communities.length === 0 ? (
              <button type="button" className="cm-btn" onClick={startCreate}>
                {fr ? "Créer une communauté" : "Create community"}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <header className="cm-chat__head">
              <div className="cm-chat__identity">
                <span
                  className="cm-avatar"
                  style={detail.avatar_url ? { backgroundImage: `url(${detail.avatar_url})` } : undefined}
                >
                  {!detail.avatar_url ? detail.name.slice(0, 1).toUpperCase() : null}
                </span>
                <div>
                  <h2>{detail.name}</h2>
                  <p>{detail.description || (fr ? `${members.length} membres` : `${members.length} members`)}</p>
                </div>
              </div>
              {!isCreator ? (
                <button type="button" className="cm-btn-secondary" onClick={() => setScreen("settings")}>
                  {fr ? "Config" : "Settings"}
                </button>
              ) : null}
            </header>

            {error ? <p className="cm-error">{error}</p> : null}

            <div className="cm-chat__messages">
              {messages.length === 0 ? (
                <p className="cm-empty">
                  {fr ? "Aucun message — démarrez la conversation." : "No messages yet — start the conversation."}
                </p>
              ) : (
                messages.map((m, idx) => {
                  const mine = m.authorId === userId;
                  const prev = idx > 0 ? messages[idx - 1] : null;
                  const showAuthor = !mine && (!prev || prev.authorId !== m.authorId);
                  const kind = mediaKindFromUrl(m.imageUrl);
                  const hasMedia = Boolean(m.imageUrl);
                  const hasText = Boolean(m.body?.trim());
                  const mediaOnly = hasMedia && !hasText && !m.replyPreview;

                  return (
                    <article
                      key={m.id}
                      id={`cm-msg-${m.id}`}
                      className={`cm-bubble-row${mine ? " is-mine" : ""}${showAuthor ? " is-first" : ""}`}
                    >
                      <div
                        className={`cm-bubble${hasMedia ? " has-media" : ""}${mediaOnly ? " is-media-only" : ""}`}
                      >
                        {showAuthor ? <div className="cm-bubble__author">{m.authorName}</div> : null}

                        {m.replyPreview ? (
                          <button
                            type="button"
                            className="cm-bubble__quote"
                            onClick={() => {
                              document.getElementById(`cm-msg-${m.replyPreview!.id}`)?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                            }}
                          >
                            <strong>{m.replyPreview.authorName || (fr ? "Message" : "Message")}</strong>
                            <span>{replySnippet(m.replyPreview, fr)}</span>
                            {m.replyPreview.imageUrl && mediaKindFromUrl(m.replyPreview.imageUrl) === "image" ? (
                              <img src={m.replyPreview.imageUrl} alt="" className="cm-bubble__quote-thumb" />
                            ) : null}
                          </button>
                        ) : null}

                        {m.imageUrl ? (
                          kind === "video" ? (
                            <div className="cm-bubble__media">
                              <video src={m.imageUrl} controls playsInline />
                            </div>
                          ) : kind === "audio" ? (
                            <div className="cm-bubble__audio">
                              <audio src={m.imageUrl} controls />
                            </div>
                          ) : (
                            <a
                              href={m.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="cm-bubble__media"
                            >
                              <img src={m.imageUrl} alt="" />
                            </a>
                          )
                        ) : null}

                        {hasText ? <div className="cm-bubble__text">{renderBody(m.body)}</div> : null}

                        <div className={`cm-bubble__meta${mediaOnly ? " on-media" : ""}`}>
                          <time dateTime={m.createdAt}>{formatBubbleTime(m.createdAt)}</time>
                        </div>

                        {canPost ? (
                          <button
                            type="button"
                            className="cm-bubble__reply"
                            title={fr ? "Répondre" : "Reply"}
                            onClick={() => setReplyTo(m)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M9 17H4V12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M20 18a8 8 0 0 0-14.14-5.17L4 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="cm-bubble__reply-label">{fr ? "Répondre" : "Reply"}</span>
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <footer className="cm-composer">
              {replyTo ? (
                <div className="cm-composer__reply">
                  <div className="cm-composer__reply-bar" />
                  <div className="cm-composer__reply-body">
                    <strong>{replyTo.authorName}</strong>
                    <span>{replyTo.body || (replyTo.imageUrl ? (fr ? "Photo" : "Photo") : "…")}</span>
                  </div>
                  {replyTo.imageUrl && mediaKindFromUrl(replyTo.imageUrl) === "image" ? (
                    <img src={replyTo.imageUrl} alt="" className="cm-composer__reply-thumb" />
                  ) : null}
                  <button type="button" onClick={() => setReplyTo(null)} aria-label={fr ? "Annuler" : "Cancel"}>
                    ×
                  </button>
                </div>
              ) : null}
              {mentionOpen && mentionCandidates.length > 0 ? (
                <ul className="cm-mentions">
                  {mentionCandidates.map((m) => (
                    <li key={m.userId}>
                      <button type="button" onClick={() => insertMention(m)}>
                        @{m.username || m.name} — {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canPost ? (
                <>
                  {pendingFile && pendingPreview ? (
                    <div className="cm-composer__preview">
                      <div className="cm-composer__preview-thumb">
                        {pendingKind === "video" ? (
                          <video src={pendingPreview} muted playsInline />
                        ) : pendingKind === "audio" ? (
                          <div className="cm-composer__preview-audio" title={pendingFile.name}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M9 18V6l12-2v12"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </div>
                        ) : (
                          <img src={pendingPreview} alt="" />
                        )}
                      </div>
                      <div className="cm-composer__preview-meta">
                        <strong>
                          {pendingKind === "video"
                            ? fr
                              ? "Vidéo"
                              : "Video"
                            : pendingKind === "audio"
                              ? "Audio"
                              : fr
                                ? "Image"
                                : "Image"}
                        </strong>
                        <span>{pendingFile.name}</span>
                      </div>
                      <button
                        type="button"
                        className="cm-composer__preview-clear"
                        onClick={clearPending}
                        aria-label={fr ? "Retirer" : "Remove"}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <div className="cm-composer__row">
                    <div className="cm-attach" ref={attachWrapRef}>
                      <button
                        type="button"
                        className="cm-icon-btn"
                        onClick={() => setAttachMenuOpen((v) => !v)}
                        title={fr ? "Joindre un fichier" : "Attach a file"}
                        aria-expanded={attachMenuOpen}
                        aria-haspopup="menu"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M12 5v14M5 12h14"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                      {attachMenuOpen ? (
                        <div className="cm-attach__menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => openAttachPicker("image")}>
                            {fr ? "Image" : "Image"}
                          </button>
                          <button type="button" role="menuitem" onClick={() => openAttachPicker("audio")}>
                            Audio
                          </button>
                          <button type="button" role="menuitem" onClick={() => openAttachPicker("video")}>
                            {fr ? "Vidéo" : "Video"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <input
                      ref={messageFileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        e.target.value = "";
                        onPickAttachment(file);
                      }}
                    />
                    <input
                      className="cm-composer__input"
                      value={draft}
                      onChange={(e) => onDraftChange(e.target.value)}
                      placeholder={fr ? "Envoyer un chat…" : "Send a chat…"}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="cm-btn cm-btn--send"
                      disabled={sending || (!draft.trim() && !pendingFile)}
                      onClick={() => void sendMessage()}
                      aria-label={fr ? "Envoyer" : "Send"}
                    >
                      {sending ? (
                        "…"
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M3.4 20.6 21 12 3.4 3.4 3 10l12 2-12 2z"
                            fill="currentColor"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="cm-composer__blocked" role="status">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M7.5 7.5l9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p>
                    {fr
                      ? "Vous n’avez pas la permission d’envoyer des messages"
                      : "You don’t have permission to send messages"}
                  </p>
                </div>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
