"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import type { User } from "@supabase/supabase-js";

import {
  getPriceIdForUpgrade,
  handleUpgrade,
} from "@/lib/checkout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

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
  plan: "free" | "spark" | "build" | "scale";
};

function normalizeDashboardPlan(
  raw: string | undefined
): "free" | "spark" | "build" | "scale" {
  const p = raw?.toLowerCase() ?? "free";
  return p === "build" ? "build" : p === "scale" ? "scale" : p === "spark" ? "spark" : "free";
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

  // Fallback: scan full verdict text
  const full = verdict.toUpperCase();
  if (full.includes("FLIP IT")) return "FLIP";
  if (full.includes("BUILD IT")) return "BUILD";
  if (full.includes("KILL IT")) return "KILL";
  if (full.includes("PIVOTEZ") || full.includes("PIVOTER")) return "FLIP";
  if (full.includes("CONSTRUISEZ") || full.includes("LANCEZ")) return "BUILD";
  if (full.includes("ABANDONNEZ") || full.includes("TUEZ")) return "KILL";

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
  const router = useRouter();
  const pathname = usePathname();
  const lang = useLang();

  const t = {
    en: {
      workspaces: "Workspaces",
      new_analysis: "+ New Analysis",
      your_ideas: "YOUR IDEAS",
      no_ideas: "No analyses yet. Start your first one.",
      ideas_analyzed: "IDEAS ANALYZED",
      verdicts: "VERDICTS",
      view_last: "View last analysis",
      home: "← Home",
      free_plan: "Free Plan",
      upgrade: "Upgrade to Spark →",
      copy_verdict: "Copy verdict",
      project_workspace: "Project workspace",
      rename_project: "✎ Rename project",
      remove_analysis: "Remove analysis",
      your_workspaces: "Your Workspaces",
      choose_project: "Choose an idea to work on",
      no_workspaces:
        "No workspaces yet. Run an analysis and get a BUILD IT or FLIP IT verdict to create one.",
      rename_title: "Rename project",
      cancel: "Cancel",
      save: "Save",
      building: "building",
      pivoting: "pivoting",
      killed: "killed",
      last_analysis: "Your last verdict",
      no_analysis_yet: "No analysis yet",
      flip: "FLIP",
      build: "BUILD",
      kill: "KILL",
    },
    fr: {
      workspaces: "Espaces de travail",
      new_analysis: "+ Nouvelle analyse",
      your_ideas: "VOS IDÉES",
      no_ideas: "Pas encore d'analyses. Commencez votre première.",
      ideas_analyzed: "IDÉES ANALYSÉES",
      verdicts: "VERDICTS",
      view_last: "Voir la dernière analyse",
      home: "← Accueil",
      free_plan: "Plan Gratuit",
      upgrade: "Passer à Spark →",
      copy_verdict: "Copier le verdict",
      project_workspace: "Espace de travail",
      rename_project: "✎ Renommer le projet",
      remove_analysis: "Supprimer l'analyse",
      your_workspaces: "Vos espaces de travail",
      choose_project: "Choisissez une idée sur laquelle travailler",
      no_workspaces:
        "Pas encore d'espaces de travail. Lancez une analyse et obtenez un verdict BUILD IT ou FLIP IT pour en créer un.",
      rename_title: "Renommer le projet",
      cancel: "Annuler",
      save: "Sauvegarder",
      building: "en construction",
      pivoting: "en pivot",
      killed: "abandonné",
      last_analysis: "Ton dernier verdict",
      no_analysis_yet: "Pas encore d'analyse",
      flip: "FLIP",
      build: "BUILD",
      kill: "KILL",
    },
  }[lang];

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
  /** analysis id → project id for analyses that have a workspace */
  const [projectByAnalysisId, setProjectByAnalysisId] = useState<
    Record<string, string>
  >({});
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  useEffect(() => {
    const shouldOpen = localStorage.getItem("klayan_open_workspaces");
    if (shouldOpen === "true") {
      setShowWorkspaces(true);
      localStorage.removeItem("klayan_open_workspaces");
    }
  }, []);
  const [projects, setProjects] = useState<
    Array<{ id: string; idea_name: string; status: string }>
  >([]);
  const [wallpaper, setWallpaper] = useState<string>("#0a0a0a");
  const [wallpaperType, setWallpaperType] = useState<"color" | "gradient" | "image">("color");
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [textColor, setTextColor] = useState<string>("#ffffff");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);

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
    setProjectByAnalysisId({});
    setProjects([]);

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
            plan: "free",
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
          plan: "free",
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

      try {
        const { data: projectsData, error: projError } = await supabase
          .from("projects")
          .select("id, analysis_id, idea_name, status")
          .eq("user_id", u.id);

        if (projError) {
          console.error("Dashboard: projects query error", projError);
          setProjectByAnalysisId({});
          setProjects([]);
        } else {
          const map: Record<string, string> = {};
          const list: Array<{ id: string; idea_name: string; status: string }> =
            [];
          for (const p of projectsData ?? []) {
            const row = p as {
              id?: string;
              analysis_id?: string;
              idea_name?: string;
              status?: string;
            };
            if (
              typeof row.analysis_id === "string" &&
              typeof row.id === "string"
            ) {
              map[row.analysis_id] = row.id;
            }
            if (
              typeof row.id === "string" &&
              typeof row.idea_name === "string" &&
              typeof row.status === "string"
            ) {
              list.push({
                id: row.id,
                idea_name: row.idea_name,
                status: row.status,
              });
            }
          }
          setProjectByAnalysisId(map);
          setProjects(list);
        }
      } catch (e) {
        console.error("Dashboard: projects exception", e);
        setProjectByAnalysisId({});
        setProjects([]);
      }
    } catch (e) {
      console.error("Dashboard: load failed", e);
      setFatalError(
        "Something went wrong loading your dashboard. Check your connection and try again."
      );
      setUser(null);
      setRows([]);
      setProfile(null);
      setProjectByAnalysisId({});
      setProjects([]);
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

  useEffect(() => {
    const saved = localStorage.getItem("klayan_wallpaper") ?? "#0a0a0a";
    const savedType = (localStorage.getItem("klayan_wallpaper_type") ?? "color") as "color" | "gradient" | "image";
    setWallpaper(saved);
    setWallpaperType(savedType);
    const savedTextColor = localStorage.getItem("klayan_text_color") ?? "#ffffff";
    setTextColor(savedTextColor);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      setShowUpgradeSuccess(true);
      window.history.replaceState({}, "", "/dashboard");
      setTimeout(() => setShowUpgradeSuccess(false), 4000);
    }
  }, []);

  const applyWallpaper = useCallback((value: string, type: "color" | "gradient" | "image", nextTextColor?: string) => {
    localStorage.setItem("klayan_wallpaper", value);
    localStorage.setItem("klayan_wallpaper_type", type);
    setWallpaper(value);
    setWallpaperType(type);
    if (nextTextColor !== undefined) {
      localStorage.setItem("klayan_text_color", nextTextColor);
      setTextColor(nextTextColor);
    }
    setShowWallpaperPicker(false);
  }, []);

  const applyTextColor = useCallback((color: string) => {
    localStorage.setItem("klayan_text_color", color);
    setTextColor(color);
  }, []);

  const handleWallpaperImageDash = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      applyWallpaper(result, "image");
    };
    reader.readAsDataURL(file);
  };

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
              plan: "free",
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

  const renameProject = useCallback(async (projectId: string, newName: string) => {
    if (!supabase || !newName.trim()) return;
    await supabase.from("projects").update({ idea_name: newName.trim() }).eq("id", projectId);
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, idea_name: newName.trim() } : p));
    setRenamingProjectId(null);
    setRenameValue("");
  }, [supabase]);

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

  const isFounder = user?.email === "klayan.app@gmail.com" || user?.email === "nellecom21@gmail.com";

  const avatarUrl = profile?.avatar_url ?? null;
  const profileUsername = profile?.username ?? null;
  const userPlan = profile?.plan ?? "free";

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
      {showUpgradeSuccess ? (
        <div style={{
          position: "fixed",
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#4ade80",
          color: "#000",
          padding: "14px 28px",
          borderRadius: 100,
          fontSize: 14,
          fontWeight: 700,
          zIndex: 9999,
          letterSpacing: "-0.01em",
          boxShadow: "0 8px 32px rgba(74,222,128,0.3)",
        }}>
          🎉 Plan upgraded successfully! Welcome to the next level.
        </div>
      ) : null}
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
          boxSizing: "border-box",
          ...(isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: 100,
                height: "100vh",
                maxHeight: "100dvh",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                transform: `translateX(${sidebarOpen ? "0" : "-100%"})`,
                transition: "transform 0.3s ease",
              }
            : {
                position: "sticky",
                top: 0,
                height: "100vh",
                overflowY: "auto",
              }),
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
              src="/images/navbarlogo.png"
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
              <Link
                href="/settings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 8,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 100,
                  padding: "5px 12px",
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                ⚙ Settings
              </Link>
              <a
                href="https://discord.gg/nHVEPB2yXb"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                  background: "transparent",
                  border: "1px solid rgba(88,101,242,0.3)",
                  borderRadius: 100,
                  padding: "5px 12px",
                  color: "rgba(88,101,242,0.8)",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#5865f2"; e.currentTarget.style.borderColor = "rgba(88,101,242,0.6)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(88,101,242,0.8)"; e.currentTarget.style.borderColor = "rgba(88,101,242,0.3)"; }}
              >
                Discord Community
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowWorkspaces(!showWorkspaces)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              background: showWorkspaces ? "rgba(255,255,255,0.1)" : "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "12px 0",
              color: "#fff",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "-0.02em",
              marginBottom: 10,
            }}
          >
            {t.workspaces}
          </button>

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
            {t.new_analysis}
          </Link>

          {showWorkspaces ? (
            <div style={{
              position: "fixed",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
            onClick={() => setShowWorkspaces(false)}
            >
              <div
                style={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 20,
                  padding: 32,
                  width: "100%",
                  maxWidth: 480,
                  maxHeight: "80vh",
                  overflowY: "auto",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>{t.your_workspaces}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{t.choose_project}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWorkspaces(false)}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 20, padding: 0 }}
                  >
                    ✕
                  </button>
                </div>

                {projects.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                    {t.no_workspaces}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {projects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/project/${project.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "16px 20px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 14,
                          textDecoration: "none",
                          color: "#fff",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: project.status === "building" ? "#4ade80" : project.status === "pivoting" ? "#facc15" : "#f87171",
                            flexShrink: 0,
                          }} />
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 2 }}>
                              {project.idea_name.length > 40 ? project.idea_name.slice(0, 37) + "..." : project.idea_name}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "capitalize" }}>
                              {project.status === "building"
                                ? t.building
                                : project.status === "pivoting"
                                  ? t.pivoting
                                  : project.status === "killed"
                                    ? t.killed
                                    : project.status}
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>→</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 10,
            }}
          >
            {t.your_ideas}
          </div>
        </div>

        <div
          style={{
            flex: 1,
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
              {t.no_ideas}
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
                      {(() => {
                        const projectId = projectByAnalysisId[row.id];
                        const project = projectId ? projects.find((p) => p.id === projectId) : null;
                        const name = project?.idea_name ?? row.idea;
                        return name.length > 60 ? name.slice(0, 57) + "..." : name;
                      })()}
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
                          📋 {t.copy_verdict}
                        </button>

                        {projectByAnalysisId[row.id] ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const projectIdForAnalysis = projectByAnalysisId[row.id];
                                const proj = projects.find((p) => p.id === projectIdForAnalysis);
                                setRenameValue(proj?.idea_name ?? "");
                                setRenamingProjectId(projectIdForAnalysis);
                                setOpenMenuId(null);
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
                              {t.rename_project}
                            </button>
                            <Link
                              href={`/project/${projectByAnalysisId[row.id]}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                if (isMobile) setSidebarOpen(false);
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
                                textDecoration: "none",
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.background =
                                  "rgba(255,255,255,0.06)";
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.background = "transparent";
                              }}
                            >
                              🎯 {t.project_workspace}
                            </Link>
                          </>
                        ) : null}

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
                          🗑 {t.remove_analysis}
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
                : userPlan === "free" ? t.free_plan : "Spark Plan"}
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
              {userPlan === "spark" || userPlan === "free"
                ? userPlan === "free" ? t.upgrade : "Upgrade to Build →"
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
              "url(/images/bluepattern.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: wallpaperType === "image" ? `url(${wallpaper}) center center / cover no-repeat` : wallpaper,
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
            color: textColor,
            "--dashboard-text": textColor,
            "--text-primary": textColor,
          } as CSSProperties}
        >
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.15,
              margin: "0 0 28px",
              color: "var(--text-primary)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
              {t.last_analysis}
              {lastKind && (
                <span style={{
                  fontSize: "clamp(18px, 2.5vw, 26px)",
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  color: lastKind === "BUILD" ? "#4ade80" : lastKind === "FLIP" ? "#f5c842" : "#ef4444",
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {lastKind} IT
                </span>
              )}
            </span>
          </h2>

          {loading ? (
            <p style={{ color: "color-mix(in srgb, var(--text-primary) 50%, transparent)", fontSize: 16 }}>Loading…</p>
          ) : !last ? (
            <p style={{ color: "color-mix(in srgb, var(--text-primary) 55%, transparent)", fontSize: 17, lineHeight: 1.6, maxWidth: 560 }}>
              Run your first analysis to see your verdict, hard truths, and next steps here.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "color-mix(in srgb, var(--text-primary) 45%, transparent)" }}>
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
                  color: "color-mix(in srgb, var(--text-primary) 88%, transparent)",
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
                  color: "color-mix(in srgb, var(--text-primary) 40%, transparent)",
                  marginBottom: 8,
                }}
              >
                {t.ideas_analyzed}
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
                  color: "color-mix(in srgb, var(--text-primary) 40%, transparent)",
                  marginBottom: 8,
                }}
              >
                {t.verdicts}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: "color-mix(in srgb, var(--text-primary) 85%, transparent)" }}>
                <span style={{ color: "#f5c842", fontWeight: 700 }}>{stats.flip}</span>
                <span style={{ color: "color-mix(in srgb, var(--text-primary) 35%, transparent)" }}> FLIP · </span>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>{stats.build}</span>
                <span style={{ color: "color-mix(in srgb, var(--text-primary) 35%, transparent)" }}> BUILD · </span>
                <span style={{ color: "#ef4444", fontWeight: 700 }}>{stats.kill}</span>
                <span style={{ color: "color-mix(in srgb, var(--text-primary) 35%, transparent)" }}> KILL</span>
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
                  color: "color-mix(in srgb, var(--text-primary) 40%, transparent)",
                  marginBottom: 8,
                }}
              >
                {lang === "fr" ? "TON PLAN" : "YOUR PLAN"}
              </div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {userPlan === "free" ? (lang === "fr" ? "Gratuit" : "Free") : userPlan === "spark" ? "Spark" : userPlan === "build" ? "Build" : "Scale"}
              </div>
              {["free", "spark"].includes(userPlan) && (
                <button
                  onClick={() => handleUpgrade(getPriceIdForUpgrade(userPlan), router)}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#4ade80",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    letterSpacing: "0.01em",
                  }}
                >
                  {userPlan === "free"
                    ? (lang === "fr" ? "Passer à Spark →" : "Upgrade to Spark →")
                    : (lang === "fr" ? "Passer à Build →" : "Upgrade to Build →")}
                </button>
              )}
            </div>
          </div>

          {["free", "spark"].includes(userPlan) && (
            <div style={{ marginBottom: 24, fontSize: 14, color: "color-mix(in srgb, var(--text-primary) 55%, transparent)" }}>
              {lang === "fr"
                ? <>Tu veux le pivot exact sur tes idées ? <button onClick={() => handleUpgrade(getPriceIdForUpgrade(userPlan), router)} style={{ background: "none", border: "none", color: "#4ade80", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: 0 }}>{userPlan === "free" ? "Passer à Spark →" : "Passer à Build →"}</button></>
                : <>Want the exact pivot on your ideas? <button onClick={() => handleUpgrade(getPriceIdForUpgrade(userPlan), router)} style={{ background: "none", border: "none", color: "#4ade80", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: 0 }}>{userPlan === "free" ? "Upgrade to Spark →" : "Upgrade to Build →"}</button></>
              }
            </div>
          )}
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
                {t.view_last}
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
                color: "var(--text-primary)",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.35)",
              }}
            >
              {t.new_analysis}
            </Link>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "14px 18px",
                color: "color-mix(in srgb, var(--text-primary) 45%, transparent)",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              {t.home}
            </Link>
          </div>
        </div>
        <>
          <button
            type="button"
            onClick={() => setShowWallpaperPicker(!showWallpaperPicker)}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 100,
              padding: "8px 14px",
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              letterSpacing: "-0.01em",
              zIndex: 100,
            }}
          >
            🖼 Wallpaper
          </button>

          {showWallpaperPicker ? (
            <div style={{
              position: "fixed",
              bottom: 64,
              right: 24,
              background: "rgba(15,15,15,0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: "20px",
              zIndex: 200,
              width: 280,
              boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: "-0.01em" }}>Wallpaper</div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Colors</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { value: "#0a0a0a", label: "Default" },
                    { value: "#0f1117", label: "Midnight" },
                    { value: "#0a0f0a", label: "Forest" },
                    { value: "#0a0a1a", label: "Navy" },
                    { value: "#1a0a0a", label: "Ember" },
                    { value: "#0f0a1a", label: "Violet" },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => applyWallpaper(c.value, "color")}
                      title={c.label}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: c.value,
                        border: wallpaper === c.value ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Gradients</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { value: "linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 100%)", label: "Purple Night" },
                    { value: "linear-gradient(135deg, #0a0a0a 0%, #0a1a0a 100%)", label: "Matrix" },
                    { value: "linear-gradient(135deg, #0a0a1a 0%, #001a2e 100%)", label: "Ocean" },
                    { value: "linear-gradient(135deg, #1a0a0a 0%, #2e0a0a 100%)", label: "Ember" },
                    { value: "linear-gradient(135deg, #0a0a0a 0%, #1a1a00 100%)", label: "Gold" },
                    { value: "linear-gradient(135deg, #0a0a2e 0%, #2e0a2e 100%)", label: "Cosmos" },
                  ].map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => applyWallpaper(g.value, "gradient")}
                      title={g.label}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: g.value,
                        border: wallpaper === g.value ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Custom Image</div>
                <label style={{ cursor: "pointer", display: "inline-block" }}>
                  <div style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.6)",
                  }}>
                    Upload PNG / JPG / GIF
                  </div>
                  <input type="file" accept="image/*,image/gif" onChange={handleWallpaperImageDash} style={{ display: "none" }} />
                </label>
              </div>

              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { value: "#ffffff", label: "White" },
                    { value: "#000000", label: "Black" },
                    { value: "#e2e8f0", label: "Silver" },
                    { value: "#fbbf24", label: "Gold" },
                    { value: "#60a5fa", label: "Blue" },
                    { value: "#4ade80", label: "Green" },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => applyTextColor(c.value)}
                      title={c.label}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: c.value,
                        border: textColor === c.value ? "2px solid rgba(255,255,255,0.8)" : "1px solid rgba(255,255,255,0.15)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWallpaperPicker(false)}
                style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, padding: 4 }}
              >
                ✕
              </button>
            </div>
          ) : null}
        </>
      </main>

      {renamingProjectId ? (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
        onClick={() => setRenamingProjectId(null)}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 400,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, letterSpacing: "-0.02em" }}>{t.rename_title}</div>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void renameProject(renamingProjectId, renameValue);
                if (e.key === "Escape") setRenamingProjectId(null);
              }}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "12px 16px",
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setRenamingProjectId(null)}
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 20px", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: 1 }}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => void renameProject(renamingProjectId, renameValue)}
                style={{ background: "#fff", color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1 }}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
