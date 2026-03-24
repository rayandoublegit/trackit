"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";

import {
  getPriceIdForUpgrade,
  handleUpgrade,
} from "@/lib/checkout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useRequireActiveSubscription } from "@/lib/use-require-active-subscription";

type VerdictKind = "FLIP" | "BUILD" | "KILL";

type AnalysisRow = {
  id: string;
  idea: string;
  status: string;
  verdict: string | null;
  created_at: string;
};

type DashboardProfile = {
  username: string | null;
  avatar_url: string | null;
  plan: "spark" | "build" | "scale";
};

function normalizeDashboardPlan(
  raw: string | undefined
): "spark" | "build" | "scale" {
  const p = raw?.toLowerCase() ?? "spark";
  return p === "build" || p === "scale" ? p : "spark";
}

/** Mirrors verdict page parsing; maps to short sidebar labels. */
function getVerdictKind(verdict: string | null): VerdictKind | null {
  if (!verdict) return null;
  const v = verdict.toUpperCase().trim();
  const innerMatch = v.match(/——\s*(.*?)\s*——/);
  const inner = (innerMatch?.[1] ?? v).replace(/\s+/g, " ").trim();

  if (inner === "FLIP IT") return "FLIP";
  if (inner === "BUILD IT") return "BUILD";
  if (inner === "KILL IT") return "KILL";

  if (inner.includes("/")) {
    const first = inner.split("/")[0].trim();
    if (first === "FLIP IT") return "FLIP";
    if (first === "BUILD IT") return "BUILD";
    if (first === "KILL IT") return "KILL";
  }

  const mentionsFlip = inner.includes("FLIP IT");
  const mentionsBuild = inner.includes("BUILD IT");
  const mentionsKill = inner.includes("KILL IT");

  if (mentionsFlip && !mentionsBuild && !mentionsKill) return "FLIP";
  if (mentionsBuild && !mentionsFlip && !mentionsKill) return "BUILD";
  if (mentionsKill && !mentionsFlip && !mentionsBuild) return "KILL";

  return null;
}

function verdictBadgeColor(kind: VerdictKind | null): string {
  if (kind === "FLIP") return "#f5c842";
  if (kind === "BUILD") return "#4ade80";
  if (kind === "KILL") return "#ef4444";
  return "rgba(255,255,255,0.35)";
}

function CameraIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function profileInitials(user: User, profileUsername?: string | null): string {
  const fromProfile = profileUsername?.trim();
  if (fromProfile) return fromProfile.slice(0, 2).toUpperCase();
  const meta =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined);
  if (meta?.trim()) {
    const parts = meta.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const un = user.user_metadata?.username as string | undefined;
  if (un?.trim()) return un.trim().slice(0, 2).toUpperCase();
  const email = user.email ?? "";
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

function VerdictPill({ kind }: { kind: VerdictKind | null }) {
  if (!kind) {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.4)",
          flexShrink: 0,
        }}
      >
        …
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        color: verdictBadgeColor(kind),
        flexShrink: 0,
      }}
    >
      {kind}
    </span>
  );
}

export default function DashboardPage() {
  useRequireActiveSubscription();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarActionError, setAvatarActionError] = useState<string | null>(
    null
  );
  const [avatarImgKey, setAvatarImgKey] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      router.push("/auth");
      return;
    }

    setLoading(true);
    setError(null);
    setFatalError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth");
        return;
      }

      const u = session.user;
      setUser(u);

      try {
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("username, avatar_url, plan")
          .eq("id", u.id)
          .single();

        if (profileError) {
          console.error("Dashboard: profiles query error", profileError);
          setProfile({
            username: null,
            avatar_url: null,
            plan: "spark",
          });
        } else {
          setProfile({
            username:
              typeof profileRow?.username === "string" &&
              profileRow.username.trim()
                ? profileRow.username.trim()
                : null,
            avatar_url:
              typeof profileRow?.avatar_url === "string" &&
              profileRow.avatar_url
                ? profileRow.avatar_url
                : null,
            plan: normalizeDashboardPlan(
              profileRow?.plan as string | undefined
            ),
          });
        }
      } catch (e) {
        console.error("Dashboard: profiles exception", e);
        setProfile({
          username: null,
          avatar_url: null,
          plan: "spark",
        });
      }

      try {
        const { data: analysesData, error: qError } = await supabase
          .from("analyses")
          .select("id, idea, status, verdict, created_at")
          .eq("user_id", u.id)
          .order("created_at", { ascending: false });

        if (qError) {
          console.error("Dashboard: analyses query error", qError);
          setError(
            "We couldn’t load your analyses. Try refreshing the page in a moment."
          );
          setRows([]);
        } else {
          setRows((analysesData ?? []) as AnalysisRow[]);
        }
      } catch (e) {
        console.error("Dashboard: analyses exception", e);
        setError(
          "We couldn’t load your analyses. Please refresh and try again."
        );
        setRows([]);
      }
    } catch (e) {
      console.error("Dashboard: load failed", e);
      setFatalError(
        "Something went wrong loading your dashboard. Check your connection and try again."
      );
      setUser(null);
      setRows([]);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!showAvatarMenu) return;
    const onPointerDown = (e: Event) => {
      const el = avatarMenuRef.current;
      const target = e.target;
      if (
        el &&
        target instanceof Node &&
        !el.contains(target)
      ) {
        setShowAvatarMenu(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [showAvatarMenu]);

  useEffect(() => {
    if (!openMenuId) return;
    const onDocDown = (e: MouseEvent) => {
      const el = document.querySelector(
        `[data-analysis-menu="${openMenuId}"]`
      );
      if (el && !el.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [openMenuId]);

  const openAvatarFilePicker = useCallback(() => {
    setAvatarActionError(null);
    fileInputRef.current?.click();
  }, []);

  /** Requires public `avatars` bucket — see supabase/migrations/20260321_000004_profiles_avatar_url.sql */
  const handleAvatarUpload = useCallback(async (file: File) => {
    if (!supabase) return;

    setAvatarBusy(true);
    setAvatarActionError(null);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      const parts = file.name.split(".");
      const fileExt =
        parts.length > 1 && parts[parts.length - 1]?.trim()
          ? parts[parts.length - 1].toLowerCase()
          : "jpg";
      const filePath = `${authUser.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setAvatarActionError(
          uploadError.message || "Could not upload photo. Try again."
        );
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", authUser.id);

      if (updateError) {
        console.error("Dashboard: avatar profile update", updateError);
        setAvatarActionError(
          updateError.message || "Could not save photo. Try again."
        );
        return;
      }

      setProfile((prev) =>
        prev
          ? { ...prev, avatar_url: publicUrl }
          : {
              username: null,
              avatar_url: publicUrl,
              plan: "spark",
            }
      );
      setAvatarImgKey((k) => k + 1);
      setShowAvatarMenu(false);
    } catch (err) {
      console.error("Dashboard: avatar upload exception", err);
      setAvatarActionError("Something went wrong. Try again.");
    } finally {
      setAvatarBusy(false);
    }
  }, []);

  const removeAvatar = useCallback(async () => {
    if (!supabase || !user) return;

    setAvatarBusy(true);
    setAvatarActionError(null);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (updateError) {
        console.error("Dashboard: avatar remove profile", updateError);
        setAvatarActionError(
          updateError.message || "Could not remove photo. Try again."
        );
        return;
      }

      const { data: folderFiles, error: listError } = await supabase.storage
        .from("avatars")
        .list(user.id);

      if (listError) {
        console.warn("Dashboard: avatar storage list", listError);
      } else if (folderFiles?.length) {
        const { error: removeError } = await supabase.storage
          .from("avatars")
          .remove(folderFiles.map((f) => `${user.id}/${f.name}`));

        if (removeError) {
          console.warn("Dashboard: avatar storage remove", removeError);
        }
      }

      setProfile((prev) =>
        prev ? { ...prev, avatar_url: null } : prev
      );
      setShowAvatarMenu(false);
    } catch (err) {
      console.error("Dashboard: avatar remove exception", err);
      setAvatarActionError("Something went wrong. Try again.");
    } finally {
      setAvatarBusy(false);
    }
  }, [user]);

  const handleCopyVerdict = useCallback(async (analysis: AnalysisRow) => {
    const text = analysis.verdict ?? analysis.idea;
    try {
      await navigator.clipboard.writeText(text);
      setOpenMenuId(null);
      setCopyToast(true);
      window.setTimeout(() => setCopyToast(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setOpenMenuId(null);
      setCopyToast(true);
      window.setTimeout(() => setCopyToast(false), 2000);
    }
  }, []);

  const handleDeleteAnalysis = useCallback(
    async (id: string) => {
      if (!supabase || !user) return;
      const { error } = await supabase
        .from("analyses")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Dashboard: delete analysis", error);
        return;
      }

      setRows((prev) => prev.filter((a) => a.id !== id));
      setOpenMenuId(null);
      if (pathname === `/verdict/${id}`) {
        router.push("/dashboard");
      }
    },
    [pathname, router, supabase, user]
  );

  const last = rows[0] ?? null;
  const lastKind = last ? getVerdictKind(last.verdict) : null;

  const stats = useMemo(() => {
    const total = rows.length;
    let flip = 0;
    let build = 0;
    let kill = 0;
    for (const r of rows) {
      const k = getVerdictKind(r.verdict);
      if (k === "FLIP") flip += 1;
      else if (k === "BUILD") build += 1;
      else if (k === "KILL") kill += 1;
    }
    const withVerdict = flip + build + kill;
    const hoursEst = withVerdict * 6;
    return { total, flip, build, kill, withVerdict, hoursEst };
  }, [rows]);

  const isFounder = user?.email === "klayan.app@gmail.com";

  const avatarUrl = profile?.avatar_url ?? null;
  const profileUsername = profile?.username ?? null;
  const userPlan = profile?.plan ?? "spark";

  const shell = {
    fontFamily: "'Inter', sans-serif",
    color: "#fff" as const,
  };

  if (!loading && fatalError) {
    return (
      <div
        style={{
          ...shell,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          padding: 24,
          textAlign: "center",
          gap: 20,
        }}
      >
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", maxWidth: 400, lineHeight: 1.5 }}>
          {fatalError}
        </p>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          style={{
            background: "#fff",
            color: "#000",
            border: "none",
            borderRadius: 10,
            padding: "12px 24px",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Try again
        </button>
        <Link
          href="/auth"
          style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        ...shell,
        minHeight: "100vh",
        display: "flex",
        background: "#000000",
        position: "relative",
      }}
    >
      {isMobile && sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99,
            background: "rgba(0,0,0,0.6)",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        />
      ) : null}

      {isMobile ? (
        <button
          type="button"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          onClick={() => setSidebarOpen((o) => !o)}
          style={{
            position: "fixed",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 101,
            width: 32,
            height: 80,
            background: "#111",
            border: "1px solid rgba(255,255,255,0.08)",
            borderLeft: "none",
            borderRadius: "0 12px 12px 0",
            color: "rgba(255,255,255,0.85)",
            fontSize: 22,
            fontWeight: 300,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {sidebarOpen ? "‹" : "›"}
        </button>
      ) : null}

      {/* Left sidebar */}
      <aside
        style={{
          width: 300,
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.08)",
          background: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          boxSizing: "border-box",
          ...(isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: 100,
                height: "100vh",
                maxHeight: "100dvh",
                transform: `translateX(${sidebarOpen ? "0" : "-100%"})`,
                transition: "transform 0.3s ease",
              }
            : {}),
        }}
      >
        <div style={{ padding: "24px 20px 20px" }}>
          <Link
            href="/"
            aria-label="Klayan home"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              marginBottom: 22,
              background: "rgba(171,171,171,0.24)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderRadius: "50%",
              textDecoration: "none",
            }}
          >
            <img
              src="https://i.ibb.co/msYn5RH/navbarlogo.png"
              alt=""
              width={48}
              height={48}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <div
              ref={avatarMenuRef}
              style={{ position: "relative", flexShrink: 0 }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleAvatarUpload(file);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setAvatarActionError(null);
                  setShowAvatarMenu((v) => !v);
                }}
                aria-expanded={showAvatarMenu}
                aria-haspopup="menu"
                disabled={!user}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  overflow: "hidden",
                  flexShrink: 0,
                  padding: 0,
                  cursor: user ? "pointer" : "default",
                  color: "#fff",
                }}
              >
                {user && avatarUrl ? (
                  <img
                    key={avatarImgKey}
                    src={avatarUrl}
                    alt=""
                    width={44}
                    height={44}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : user ? (
                  profileInitials(user, profileUsername)
                ) : (
                  "—"
                )}
              </button>

              {showAvatarMenu && user ? (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    zIndex: 100,
                    minWidth: 200,
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                  }}
                >
                  {avatarUrl ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={avatarBusy}
                        onClick={() => openAvatarFilePicker()}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "10px 10px",
                          border: "none",
                          borderRadius: 8,
                          background: "transparent",
                          color: "#fff",
                          fontSize: 14,
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 500,
                          cursor: avatarBusy ? "wait" : "pointer",
                          textAlign: "left",
                        }}
                      >
                        <CameraIcon />
                        Change photo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={avatarBusy}
                        onClick={() => void removeAvatar()}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "10px 10px",
                          border: "none",
                          borderRadius: 8,
                          background: "transparent",
                          color: "#ef4444",
                          fontSize: 14,
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 500,
                          cursor: avatarBusy ? "wait" : "pointer",
                          textAlign: "left",
                        }}
                      >
                        <TrashIcon />
                        Remove photo
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={avatarBusy}
                      onClick={() => openAvatarFilePicker()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        padding: "10px 10px",
                        border: "none",
                        borderRadius: 8,
                        background: "transparent",
                        color: "#fff",
                        fontSize: 14,
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 500,
                        cursor: avatarBusy ? "wait" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <CameraIcon />
                      Add photo
                    </button>
                  )}
                  {avatarActionError ? (
                    <p
                      style={{
                        margin: "6px 4px 0",
                        fontSize: 12,
                        color: "#f87171",
                        lineHeight: 1.4,
                      }}
                    >
                      {avatarActionError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  minWidth: 0,
                  lineHeight: 1.2,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {profileUsername?.trim() ||
                    user?.email?.split("@")[0] ||
                    "Founder"}
                </span>
                {isFounder ? (
                  <span
                    style={{
                      background:
                        "linear-gradient(135deg, #f5c842, #ff6b35)",
                      color: "#000",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: "100px",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      marginLeft: 8,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    ⚡ Founder
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.email ?? ""}
              </div>
            </div>
          </div>

          <Link
            href="/analyze"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              background: "#fff",
              color: "#000",
              borderRadius: 10,
              padding: "12px 16px",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              marginBottom: 24,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            New Analysis
          </Link>

          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 10,
            }}
          >
            YOUR IDEAS
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {loading ? (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "0 8px" }}>
              Loading…
            </p>
          ) : error ? (
            <p style={{ fontSize: 13, color: "#f87171", padding: "0 8px" }}>{error}</p>
          ) : rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", padding: "0 8px", lineHeight: 1.5 }}>
              No ideas yet. Start a new analysis.
            </p>
          ) : (
            rows.map((row) => {
              const kind = getVerdictKind(row.verdict);
              const menuVisible =
                hoveredRowId === row.id || openMenuId === row.id;
              return (
                <div
                  key={row.id}
                  data-analysis-menu={row.id}
                  onMouseEnter={() => setHoveredRowId(row.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 4,
                    padding: "10px 10px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Link
                    href={`/verdict/${row.id}`}
                    onClick={() => {
                      if (isMobile) setSidebarOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      flex: 1,
                      minWidth: 0,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <VerdictPill kind={kind} />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: 1.4,
                        color: "rgba(255,255,255,0.88)",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {row.idea}
                    </span>
                  </Link>
                  <div
                    style={{
                      position: "relative",
                      flexShrink: 0,
                      alignSelf: "flex-start",
                      opacity: menuVisible ? 1 : 0,
                      pointerEvents: menuVisible ? "auto" : "none",
                      transition: "opacity 0.12s ease",
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Analysis actions"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenuId((cur) =>
                          cur === row.id ? null : row.id
                        );
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "rgba(255,255,255,0.4)",
                        cursor: "pointer",
                        fontSize: 16,
                        padding: "4px 8px",
                        borderRadius: 6,
                        lineHeight: 1,
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.08)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      ⋯
                    </button>

                    {openMenuId === row.id ? (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "100%",
                          background: "#1a1a1a",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 12,
                          padding: 6,
                          zIndex: 100,
                          minWidth: 180,
                          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyVerdict(row);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            color: "white",
                            padding: "10px 12px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                            fontFamily: "Inter, sans-serif",
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.06)";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          📋 Copy verdict
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteAnalysis(row.id);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            color: "#ef4444",
                            padding: "10px 12px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                            fontFamily: "Inter, sans-serif",
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background =
                              "rgba(239,68,68,0.08)";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          🗑 Remove analysis
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            padding: "16px 20px 24px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              marginBottom: 10,
            }}
          >
            Plan
          </div>
          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {userPlan === "scale"
              ? "Scale Plan"
              : userPlan === "build"
                ? "Build Plan"
                : "Spark Plan"}
          </div>
          {userPlan === "scale" ? (
            <div
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                background: "rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.4)",
                cursor: "default",
                userSelect: "none",
              }}
            >
              Current plan
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const priceId = getPriceIdForUpgrade(userPlan);
                if (!priceId) return;
                void handleUpgrade(priceId).catch(() => {});
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                color: "#000",
                fontSize: 13,
                fontWeight: 600,
                background: "#fff",
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {userPlan === "spark"
                ? "Upgrade to Build →"
                : "Upgrade to Scale →"}
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          position: "relative",
          minHeight: "100vh",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "url(https://i.ibb.co/1YxCZPjC/bluepattern.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: isMobile ? "24px 16px 40px" : "40px 40px 48px",
            maxWidth: 920,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.15,
              margin: "0 0 28px",
              color: "#fff",
            }}
          >
            <span>Your last </span>
            <span
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              analysis
            </span>
            <span>:</span>
          </h2>

          {loading ? (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16 }}>Loading…</p>
          ) : !last ? (
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 17, lineHeight: 1.6, maxWidth: 560 }}>
              Run your first analysis to see your verdict, hard truths, and next steps here.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <VerdictPill kind={lastKind} />
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                  {new Date(last.created_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.65,
                  color: "rgba(255,255,255,0.88)",
                  margin: "0 0 36px",
                  maxWidth: 720,
                }}
              >
                {last.idea.length > 320 ? `${last.idea.slice(0, 320)}…` : last.idea}
              </p>
            </>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 16,
              marginBottom: 36,
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14,
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 8,
                }}
              >
                IDEAS ANALYZED
              </div>
              <div
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                }}
              >
                {stats.total}
              </div>
            </div>
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14,
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 8,
                }}
              >
                VERDICTS
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.85)" }}>
                <span style={{ color: "#f5c842", fontWeight: 700 }}>{stats.flip}</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}> FLIP · </span>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>{stats.build}</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}> BUILD · </span>
                <span style={{ color: "#ef4444", fontWeight: 700 }}>{stats.kill}</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}> KILL</span>
              </div>
            </div>
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14,
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 8,
                }}
              >
                TIME SAVED
              </div>
              <div
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                }}
              >
                {stats.hoursEst}
                <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
                  {" "}
                  hrs est.
                </span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                ~6 hrs per verdict vs. manual research
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {last ? (
              <Link
                href={`/verdict/${last.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "14px 26px",
                  borderRadius: 100,
                  background: "#fff",
                  color: "#000",
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                }}
              >
                View last analysis
              </Link>
            ) : null}
            <Link
              href="/analyze"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "14px 26px",
                borderRadius: 100,
                background: "transparent",
                color: "#fff",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.35)",
              }}
            >
              + New Analysis
            </Link>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "14px 18px",
                color: "rgba(255,255,255,0.45)",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              ← Home
            </Link>
          </div>
        </div>
      </main>

      {copyToast ? (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10000,
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            color: "#fff",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          }}
        >
          Copied!
        </div>
      ) : null}
    </div>
  );
}
