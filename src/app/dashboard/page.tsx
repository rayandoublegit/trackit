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

function VerdictPill({
  kind,
  labelBuilding,
  labelPivoting,
  labelKilled,
}: {
  kind: VerdictKind | null;
  labelBuilding: string;
  labelPivoting: string;
  labelKilled: string;
}) {
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
    <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: verdictBadgeColor(kind), display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: "#aaa", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
        {kind === "BUILD" ? labelBuilding : kind === "FLIP" ? labelPivoting : labelKilled}
      </span>
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
      new_analysis: "New Analysis",
      your_ideas: "Ideas",
      no_ideas: "No analyses yet. Start your first one.",
      ideas_analyzed: "IDEAS ANALYZED",
      verdicts: "VERDICTS",
      view_last: "View last analysis",
      home: "Home",
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
      dashboard: "Dashboard",
      welcome_back: "Welcome back,",
      search: "Search ideas...",
      status: "Status",
      sort: "Sort",
      newest: "Newest",
      oldest: "Oldest",
      overview: "Overview",
      ideas_tab: "Ideas",
      settings_tab: "Settings",
      profile_tab: "Profile",
      billing_tab: "Billing",
      open_workspace: "Open workspace",
      main_menu: "Main Menu",
      others: "Others",
      account: "Account",
      homepage: "Homepage",
      light: "Light",
      dark: "Dark",
      english: "English",
      français: "Français",
      upgrade_build: "Upgrade to Build",
      upgrade_desc: "Unlock all features and get the most out of Klayan.",
      upgrade_now: "Upgrade Now →",
      username: "Username",
      appearance: "Appearance",
      appearance_desc: "Choose how the dashboard looks.",
      language: "Language",
      language_desc: "Choose the language for verdicts and analysis reports.",
      delete_account: "Delete account",
      delete_account_desc: "Permanently delete your account and all data. This cannot be undone.",
      recent_ideas: "Recent Ideas",
      settings_title: "Settings",
      settings_desc: "Customize your Klayan experience.",
      billing_title: "Billing",
      billing_desc: "Manage your subscription.",
      profile_title: "Profile",
      profile_desc: "Manage your account settings.",
      all: "All",
      current_plan: "Current plan",
      payment_method: "Payment method",
      manage_billing: "Manage billing →",
      cancel_subscription: "Cancel subscription",
      cancel_plan: "Cancel plan",
      upgrade_plan: "Upgrade plan →",
      sign_out: "Sign out",
      sign_out_desc: "You will be redirected to the login page.",
      unlimited_analyses: "{t.unlimited_analyses}",
      payment_desc: "Manage your payment method via the Stripe customer portal.",
      cancel_desc: "You will lose access to premium features at the end of your billing period.",
      billing_desc2: "Manage your subscription and payment methods.",
      ideas_analyzed: "Ideas Analyzed",
      total_analyses: "Total analyses run",
      all_time: "All time",
      verdicts_title: "Verdicts",
      build_flip_kill: "Build · Flip · Kill",
      across_all: "Across all ideas",
      your_plan: "Your Plan",
      current_sub: "Current subscription",
      upgrade_available: "Upgrade available",
      full_access: "Full access",
      active_projects: "active projects",
      eight_active: "8 active projects",
      view: "View →",
      open_workspace: "Ouvrir l'espace",
    },
    fr: {
      workspaces: "Espaces de travail",
      new_analysis: "Nouvelle analyse",
      your_ideas: "Idées",
      no_ideas: "Pas encore d'analyses. Commencez votre première.",
      ideas_analyzed: "IDÉES ANALYSÉES",
      verdicts: "VERDICTS",
      view_last: "Voir la dernière analyse",
      home: "Accueil",
      free_plan: "Plan Gratuit",
      upgrade: "Passer à Spark →",
      copy_verdict: "Copier le verdict",
      project_workspace: "Espace de travail",
      rename_project: "✎ Renommer le projet",
      remove_analysis: "Supprimer l'analyse",
      your_workspaces: "Vos espaces de travail",
      choose_project: "Choisissez une idée sur laquelle travailler",
      no_workspaces: "Pas encore d'espaces de travail. Lancez une analyse et obtenez un verdict BUILD IT ou FLIP IT pour en créer un.",
      rename_title: "Renommer le projet",
      cancel: "Annuler",
      save: "Sauvegarder",
      building: "En construction",
      pivoting: "En pivot",
      killed: "Abandonné",
      last_analysis: "Ton dernier verdict",
      no_analysis_yet: "Pas encore d'analyse",
      flip: "FLIP",
      build: "BUILD",
      kill: "KILL",
      dashboard: "Tableau de bord",
      welcome_back: "Bon retour,",
      search: "Rechercher des idées...",
      status: "Statut",
      sort: "Trier",
      newest: "Récent",
      oldest: "Ancien",
      overview: "Aperçu",
      ideas_tab: "Idées",
      settings_tab: "Paramètres",
      profile_tab: "Profil",
      billing_tab: "Facturation",
      open_workspace: "Ouvrir l'espace",
      main_menu: "Menu principal",
      others: "Autres",
      account: "Compte",
      homepage: "Page d'accueil",
      light: "Clair",
      dark: "Sombre",
      english: "English",
      français: "Français",
      upgrade_build: "Passer à Build",
      upgrade_desc: "Débloquez toutes les fonctionnalités de Klayan.",
      upgrade_now: "Mettre à niveau →",
      username: "Nom d'utilisateur",
      appearance: "Apparence",
      appearance_desc: "Choisissez l'apparence du tableau de bord.",
      language: "Langue",
      language_desc: "Choisissez la langue pour les verdicts et rapports.",
      delete_account: "Supprimer le compte",
      delete_account_desc: "Supprimez définitivement votre compte et toutes vos données. Cette action est irréversible.",
      recent_ideas: "Idées récentes",
      settings_title: "Paramètres",
      settings_desc: "Personnalisez votre expérience Klayan.",
      billing_title: "Facturation",
      billing_desc: "Gérez votre abonnement.",
      profile_title: "Profil",
      profile_desc: "Gérez les paramètres de votre compte.",
      all: "Tous",
      current_plan: "Plan actuel",
      payment_method: "Méthode de paiement",
      manage_billing: "Gérer la facturation →",
      cancel_subscription: "Annuler l'abonnement",
      cancel_plan: "Annuler le plan",
      upgrade_plan: "Mettre à niveau →",
      sign_out: "Se déconnecter",
      sign_out_desc: "Vous serez redirigé vers la page de connexion.",
      unlimited_analyses: "19€/mois — analyses illimitées.",
      payment_desc: "Gérez votre méthode de paiement via le portail Stripe.",
      cancel_desc: "Vous perdrez l'accès aux fonctionnalités premium à la fin de votre période de facturation.",
      billing_desc2: "Gérez votre abonnement et vos méthodes de paiement.",
      upgrade_build: "Passer à Build",
      ideas_analyzed: "Idées analysées",
      total_analyses: "Total des analyses",
      all_time: "Depuis toujours",
      verdicts_title: "Verdicts",
      build_flip_kill: "Build · Flip · Kill",
      across_all: "Toutes les idées",
      your_plan: "Votre plan",
      current_sub: "Abonnement actuel",
      upgrade_available: "Mise à niveau disponible",
      full_access: "Accès complet",
      active_projects: "projets actifs",
      view: "Voir →",
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
  const [ideasOpen, setIdeasOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"home" | "ideas" | "workspaces" | "profile" | "settings" | "billing">("home");
  const [selectedLang, setSelectedLang] = useState<"en" | "fr">(() => (typeof window !== "undefined" ? (localStorage.getItem("klayan_lang") as "en" | "fr" | null) ?? "en" : "en"));
  const [statusFilter, setStatusFilter] = useState<"all" | "BUILD" | "FLIP" | "KILL">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "az">("newest");
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("klayan_dark");
    setDarkMode(saved === null ? true : saved === "1");
    setMounted(true);

  }, []);
  const [notifications, setNotifications] = useState<{id: string; title: string; body: string; created_at: string; read_by: string[]}[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dashHasDraft, setDashHasDraft] = useState(false);
  const [deletedRows, setDeletedRows] = useState<typeof rows>([]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    void supabase.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setNotifications(data);
    });
    const channel = supabase.channel("notifications").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
      void supabase.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
        if (data) setNotifications(data);
      });
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);

  useEffect(() => {
    void supabase.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setNotifications(data);
    });
    const channel = supabase.channel("notifications").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
      void supabase.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
        if (data) setNotifications(data);
      });
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);

  useEffect(() => {
    const checkDraft = () => {
      try { const d = localStorage.getItem("klayan_analyze_draft"); setDashHasDraft(!!(d && JSON.parse(d).answers?.[0])); } catch { setDashHasDraft(false); }
    };
    checkDraft();
    window.addEventListener("focus", checkDraft);
    return () => window.removeEventListener("focus", checkDraft);
  }, []);
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

  const handleDeleteProject = useCallback(async (projectId: string) => {
    if (!confirm("Delete this workspace? This cannot be undone.")) return;
    await supabase.from("projects").delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, [supabase]);

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
    fontFamily: "'Europa Grotesk No 2 SH', sans-serif",
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
            background: theme.card,
            color: "#000",
            border: "none",
            borderRadius: 10,
            padding: "12px 24px",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "'Europa Grotesk No 2 SH', sans-serif",
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

  const D = darkMode;
  const theme = {
    bg: D ? "#0d0d0d" : "#f7f7f7",
    sidebar: D ? "#111" : "#fff",
    sidebarBorder: D ? "#222" : "#e5e5e5",
    main: D ? "#111" : "#fff",
    card: D ? "#1a1a1a" : "#fff",
    cardBorder: D ? "#2a2a2a" : "#e5e5e5",
    topbar: D ? "#111" : "#fff",
    topbarBorder: D ? "#222" : "#e5e5e5",
    text: D ? "#f0f0f0" : "#111",
    textMuted: D ? "#888" : "#aaa",
    textSub: D ? "#aaa" : "#555",
    inputBg: D ? "#1a1a1a" : "#fff",
    inputBorder: D ? "#333" : "#e5e5e5",
    hover: D ? "#222" : "#ebebeb",
    ctaBg: "#fff",
    ctaText: "#000",
    activeNav: D ? "#2b2d31" : "#e0e0e0",
    tabActive: D ? "#fff" : "#111",
    tabActiveBorder: D ? "#fff" : "#111",
    tabInactive: D ? "#666" : "#888",
    divider: D ? "#222" : "#e5e5e5",
    upgradeBg: D ? "#1a1a1a" : "#fff",
    dropdownBg: D ? "#1a1a1a" : "#fff",
    dropdownBorder: D ? "#333" : "#e5e5e5",
  };

  if (!mounted) return <div style={{ background: "#0d0d0d", minHeight: "100vh" }} />;
  return (
    <div
      suppressHydrationWarning
      data-dark={D ? "true" : "false"}
      style={{
        ...shell,
        minHeight: "100vh",
        display: "flex",
        background: "#0d0d0d",
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
        suppressHydrationWarning
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: `1px solid ${theme.sidebarBorder}`,
          background: theme.hover,
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          fontFamily: "'Europa Grotesk No 2 SH', sans-serif",
          ...(isMobile
            ? {
                position: "fixed",
                top: 0, left: 0,
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
        {/* Top: brand */}
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${theme.divider}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                {avatarUrl ? (
                  <img key={avatarImgKey} src={avatarUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", display: "block" }} />
                ) : (
                  <span style={{ color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
                    {(profileUsername?.trim() || user?.email?.split("@")[0] || "K")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                  {profileUsername?.trim() || user?.email?.split("@")[0] || "Klayan"}
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 1 }}>{user?.email ?? ""}</div>
              </div>
            </div>
            <div ref={avatarMenuRef} style={{ position: "relative" }}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void handleAvatarUpload(file); }} />
              <button type="button"
                onClick={() => { setAvatarActionError(null); setShowAvatarMenu((v) => !v); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted, padding: 4, borderRadius: 6, display: "flex" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
                </svg>
              </button>
              {showAvatarMenu && user ? (
                <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200, minWidth: 180, background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
                  {avatarUrl ? (
                    <>
                      <button type="button" role="menuitem" disabled={avatarBusy} onClick={() => openAvatarFilePicker()} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, background: "transparent", color: theme.text, fontSize: 13, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 500, cursor: avatarBusy ? "wait" : "pointer", textAlign: "left" }}>
                        <CameraIcon /> Change photo
                      </button>
                      <button type="button" role="menuitem" disabled={avatarBusy} onClick={() => void removeAvatar()} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, background: "transparent", color: "#ef4444", fontSize: 13, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 500, cursor: avatarBusy ? "wait" : "pointer", textAlign: "left" }}>
                        <TrashIcon /> Remove photo
                      </button>
                    </>
                  ) : (
                    <button type="button" role="menuitem" disabled={avatarBusy} onClick={() => openAvatarFilePicker()} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, background: "transparent", color: theme.text, fontSize: 13, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 500, cursor: avatarBusy ? "wait" : "pointer", textAlign: "left" }}>
                      <CameraIcon /> Add photo
                    </button>
                  )}
                  {avatarActionError ? <p style={{ margin: "4px 4px 0", fontSize: 12, color: "#f87171" }}>{avatarActionError}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: "12px" }}>
          <button type="button" onClick={() => { setActiveTab("workspaces"); if (isMobile) setSidebarOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", marginBottom: 4, background: activeTab === "workspaces" ? theme.activeNav : "transparent", border: `1px solid ${theme.cardBorder}`, borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500, color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", boxSizing: "border-box" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            {t.workspaces}
          </button>

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: theme.textMuted, margin: "16px 0 4px 12px", textTransform: "uppercase" }}>{t.main_menu}</div>
          <button type="button" onClick={() => setActiveTab("home")}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", marginBottom: 4, background: activeTab === "home" ? theme.activeNav : "transparent", border: "none", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 500, color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", boxSizing: "border-box", cursor: "pointer" }} className="kly-nav-btn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            {t.home}
          </button>

          <button type="button" onClick={() => { setActiveTab("ideas"); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", background: activeTab === "ideas" ? theme.activeNav : "transparent", border: "none", cursor: "pointer", borderRadius: 8, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", boxSizing: "border-box" }}
            className="kly-nav-btn">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{t.your_ideas}</span>
            </div>
          </button>
          <Link href="/analyze?resume=1"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 12px", marginTop: 2, background: "transparent", border: "none", borderRadius: 8, textDecoration: "none", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", boxSizing: "border-box" }}
              className="kly-nav-btn">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>Draft</span>
              </div>
              {dashHasDraft && <span style={{ fontSize: 11, background: "#f0fdf4", color: "#16a34a", borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>1</span>}
            </Link>

          <Link href="/analyze"
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", marginBottom: 2, background: "transparent", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 500, color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", boxSizing: "border-box" }}
            className="kly-nav-btn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.7"><path d="M12 5v14M5 12h14"/></svg>
            {t.new_analysis}
          </Link>
          <button type="button" onClick={() => setActiveTab("trash" as any)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 12px", marginBottom: 8, background: (activeTab as string) === "trash" ? theme.activeNav : "transparent", border: "none", cursor: "pointer", borderRadius: 8, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", boxSizing: "border-box" }}
            className="kly-nav-btn">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.7"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              <span style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>Recently Deleted</span>
            </div>
            {deletedRows.length > 0 && <span style={{ fontSize: 11, background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>{deletedRows.length}</span>}
          </button>

          {false && <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
            {loading ? (
              <p style={{ fontSize: 13, color: theme.textMuted, padding: "0 12px" }}>Loading…</p>
            ) : error ? (
              <p style={{ fontSize: 13, color: "#ef4444", padding: "0 12px" }}>{error}</p>
            ) : rows.length === 0 ? (
              <p style={{ fontSize: 13, color: theme.textMuted, padding: "0 12px", lineHeight: 1.5 }}>{t.no_ideas}</p>
            ) : rows.map((row) => {
              const kind = getVerdictKind(row.verdict);
              const menuVisible = hoveredRowId === row.id || openMenuId === row.id;
              return (
                <div key={row.id} data-analysis-menu={row.id}
                  onMouseEnter={() => setHoveredRowId(row.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: hoveredRowId === row.id ? "#ebebeb" : "transparent" }}>
                  <Link href={`/verdict/${row.id}`} onClick={() => { if (isMobile) setSidebarOpen(false); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                    <VerdictPill kind={kind} />
                    <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: theme.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {(() => { const pid = projectByAnalysisId[row.id]; const proj = pid ? projects.find((p) => p.id === pid) : null; const name = proj?.idea_name ?? row.idea; return name.length > 50 ? name.slice(0, 47) + "..." : name; })()}
                    </span>
                  </Link>
                  <div style={{ position: "relative", flexShrink: 0, opacity: menuVisible ? 1 : 0, pointerEvents: menuVisible ? "auto" : "none", transition: "opacity 0.12s" }}>
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId((cur) => cur === row.id ? null : row.id); }}
                      style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 16, padding: "2px 6px", borderRadius: 6, lineHeight: 1 }}
                      onMouseOver={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.06)"; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>⋯</button>
                    {openMenuId === row.id ? (
                      <div style={{ position: "absolute", right: 0, top: "100%", background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 10, padding: 5, zIndex: 100, minWidth: 170, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); void handleCopyVerdict(row); }}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: theme.text, padding: "9px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif" }}
                          onMouseOver={(e) => { e.currentTarget.style.background = "#f5f5f5"; }} onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>
                          📋 {t.copy_verdict}
                        </button>
                        {projectByAnalysisId[row.id] ? (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); const pid = projectByAnalysisId[row.id]; const proj = projects.find((p) => p.id === pid); setRenameValue(proj?.idea_name ?? ""); setRenamingProjectId(pid); setOpenMenuId(null); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: theme.text, padding: "9px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif" }}
                              onMouseOver={(e) => { e.currentTarget.style.background = "#f5f5f5"; }} onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>
                              {t.rename_project}
                            </button>
                            <Link href={"/project/" + projectByAnalysisId[row.id]}
                              onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); if (isMobile) setSidebarOpen(false); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", borderRadius: 7, color: theme.text, fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif", textDecoration: "none" }}
                              onMouseOver={(e) => { e.currentTarget.style.background = "#f5f5f5"; }} onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>
                              {t.project_workspace}
                            </Link>
                          </>
                        ) : null}
                        <div style={{ height: 1, background: theme.divider, margin: "4px 0" }} />
                        <button type="button" onClick={(e) => { e.stopPropagation(); void handleDeleteAnalysis(row.id); setOpenMenuId(null); }}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: "#ef4444", padding: "9px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif" }}
                          onMouseOver={(e) => { e.currentTarget.style.background = "#fff0f0"; }} onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>}
        </div>

        {/* Others */}
        <div style={{ padding: "0 12px 4px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: theme.textMuted, margin: "8px 0 4px 12px", textTransform: "uppercase" }}>{t.others}</div>
          <div style={{ height: 1, background: theme.divider, margin: "4px 0 6px" }} />
          <button type="button" onClick={() => setActiveTab("settings" as any)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", background: activeTab === "settings" ? theme.activeNav : "transparent", color: theme.text, fontSize: 14, fontWeight: 500, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            {t.settings_tab}
          </button>
          <a href="https://discord.gg/nHVEPB2yXb" target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", borderRadius: 8, textDecoration: "none", color: theme.text, fontSize: 14, fontWeight: 500, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#5865f2" }}><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
            Discord
          </a>
          <a href="mailto:support@klayan.app"
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", borderRadius: 8, textDecoration: "none", color: theme.text, fontSize: 14, fontWeight: 500, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Support
          </a>
        </div>
        {/* Account */}
        <div style={{ padding: "0 12px 4px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: theme.textMuted, margin: "8px 0 4px 12px", textTransform: "uppercase" }}>{t.account}</div>
          <div style={{ height: 1, background: theme.divider, margin: "4px 0 6px" }} />
          <button type="button" onClick={() => setActiveTab("profile" as any)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", background: activeTab === "profile" ? theme.activeNav : "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 400, color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", textAlign: "left", boxSizing: "border-box" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = activeTab === "profile" ? "#ebebeb" : "transparent"; }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {t.profile_tab}
          </button>
          <button type="button" onClick={() => setActiveTab("billing" as any)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 12px", background: activeTab === "billing" ? theme.activeNav : "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 400, color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", textAlign: "left", boxSizing: "border-box" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = activeTab === "billing" ? "#ebebeb" : "transparent"; }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            {t.billing_tab}
          </button>
        </div>
        {/* Bottom */}
        <div style={{ borderTop: `1px solid ${theme.divider}`, padding: "12px", marginTop: "auto" }}>

          <div style={{ background: theme.upgradeBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "14px 16px" }}>
            {userPlan === "scale" ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 4 }}>You&apos;re on the best plan 🎉</div>
                <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.4 }}>Scale gives you full access to everything Klayan has to offer.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 4 }}>
                  {userPlan === "free" ? (lang === "fr" ? "Passer à Spark" : "Upgrade to Spark") : userPlan === "spark" ? t.upgrade_build : (lang === "fr" ? "Passer à Scale" : "Upgrade to Scale")}
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12, lineHeight: 1.4 }}>{t.upgrade_desc}</div>
                <button type="button"
                  onClick={() => { const priceId = getPriceIdForUpgrade(userPlan); if (!priceId) return; void handleUpgrade(priceId).catch(() => {}); }}
                  style={{ display: "block", width: "100%", textAlign: "center", padding: "9px 14px", borderRadius: 8, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, background: "#111", cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
                  {t.upgrade_now}
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main suppressHydrationWarning style={{ flex: 1, minWidth: 0, background: theme.main, display: "flex", flexDirection: "column", minHeight: "100vh", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>

        {/* Top bar */}
        <div style={{ padding: "20px 32px 0", borderBottom: `1px solid ${theme.divider}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 12, borderBottom: `1px solid ${theme.divider}` }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: theme.textMuted, textDecoration: "none", padding: "6px 10px", borderRadius: 7, border: `1px solid ${theme.cardBorder}`, background: theme.card }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              {t.homepage}
            </Link>
            <img src="/images/navbarlogo.png" alt="Klayan" style={{ height: 28, objectFit: "contain" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>{t.dashboard}</div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: theme.text, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.2 }}>{t.welcome_back}</h1>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: theme.text, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.2 }}>{profileUsername?.trim() || user?.email?.split("@")[0] || "Founder"} 👋</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, borderRadius: 8, padding: "7px 14px", minWidth: 220 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.search} style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: theme.text, width: "100%", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }} />
                {searchQuery ? (
                  <button type="button" onClick={() => setSearchQuery("")} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted, padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
                ) : (
                  <span style={{ fontSize: 11, color: "#bbb", background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>⌘ F</span>
                )}
              </div>
              <div ref={notifRef} style={{ position: "relative" }}>
                <button type="button" onClick={() => setShowNotifications(v => !v)}
                  style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: "pointer" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.textSub} strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                  {notifications.filter(n => !n.read_by.includes(user?.id ?? "")).length > 0 && (
                    <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", border: "2px solid #fff" }} />
                  )}
                </button>
                {showNotifications && (
                  <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200, width: 320, background: theme.dropdownBg, border: `1px solid ${theme.dropdownBorder}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${theme.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Notifications</span>
                      {notifications.some(n => !n.read_by.includes(user?.id ?? "")) && (
                        <button type="button" onClick={async () => {
                          if (!user) return;
                          await Promise.all(notifications.filter(n => !n.read_by.includes(user.id)).map(n =>
                            supabase.from("notifications").update({ read_by: [...n.read_by, user.id] }).eq("id", n.id)
                          ));
                          setNotifications(prev => prev.map(n => ({ ...n, read_by: n.read_by.includes(user.id) ? n.read_by : [...n.read_by, user.id] })));
                        }} style={{ fontSize: 12, color: theme.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>No notifications yet</div>
                    ) : notifications.map(n => {
                      const isRead = n.read_by.includes(user?.id ?? "");
                      return (
                        <div key={n.id} onClick={async () => {
                          if (!user || isRead) return;
                          await supabase.from("notifications").update({ read_by: [...n.read_by, user.id] }).eq("id", n.id);
                          setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_by: [...x.read_by, user.id] } : x));
                        }} style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.divider}`, cursor: isRead ? "default" : "pointer", background: isRead ? "transparent" : "#fafafa" }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isRead ? "transparent" : (darkMode ? "#1a1a1c" : "#fafafa"); }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            {!isRead && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#111", flexShrink: 0, display: "inline-block" }} />}
                            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{n.title}</span>
                          </div>
                          <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5, paddingLeft: isRead ? 0 : 15 }}>{n.body}</div>
                          <div style={{ fontSize: 11, color: "#ccc", marginTop: 4, paddingLeft: isRead ? 0 : 15 }}>{new Date(n.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div ref={statusMenuRef} style={{ position: "relative" }}>
                <button type="button" onClick={() => { setShowStatusMenu(v => !v); setShowSortMenu(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, color: theme.textSub, background: theme.card, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
                  Status: <span style={{ fontWeight: 600, color: theme.text, marginLeft: 4 }}>{statusFilter === "all" ? "All" : statusFilter === "BUILD" ? t.building : statusFilter === "FLIP" ? t.pivoting : t.killed}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {showStatusMenu && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100, background: theme.dropdownBg, border: `1px solid ${theme.dropdownBorder}`, borderRadius: 10, padding: 6, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
                    {[{val: "all", label: t.all}, {val: "BUILD", label: t.building}, {val: "FLIP", label: t.pivoting}, {val: "KILL", label: t.killed}].map(({val, label}) => (
                      <button key={val} type="button" onClick={() => { setStatusFilter(val as any); setShowStatusMenu(false); }}
                        style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", borderRadius: 7, background: statusFilter === val ? theme.hover : "transparent", cursor: "pointer", fontSize: 13, fontWeight: statusFilter === val ? 600 : 400, color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", textAlign: "left" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div ref={sortMenuRef} style={{ position: "relative" }}>
                <button type="button" onClick={() => { setShowSortMenu(v => !v); setShowStatusMenu(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, color: theme.textSub, background: theme.card, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
                  Sort: <span style={{ fontWeight: 600, color: theme.text, marginLeft: 2 }}>{sortOrder === "newest" ? t.newest : sortOrder === "oldest" ? t.oldest : "A→Z"}</span>
                </button>
                {showSortMenu && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100, background: theme.dropdownBg, border: `1px solid ${theme.dropdownBorder}`, borderRadius: 10, padding: 6, minWidth: 130, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
                    {[{val: "newest", label: "Newest first"}, {val: "oldest", label: "Oldest first"}, {val: "az", label: "A → Z"}].map(({val, label}) => (
                      <button key={val} type="button" onClick={() => { setSortOrder(val as any); setShowSortMenu(false); }}
                        style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", borderRadius: 7, background: sortOrder === val ? theme.hover : "transparent", cursor: "pointer", fontSize: 13, fontWeight: sortOrder === val ? 600 : 400, color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", textAlign: "left" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <div style={{ display: "flex", gap: 0 }}>
            {[{key: "home", label: t.overview}, {key: "ideas", label: t.ideas_tab}, {key: "workspaces", label: t.workspaces}, {key: "settings", label: t.settings_tab}, {key: "profile", label: t.profile_tab}, {key: "billing", label: t.billing_tab}].map(({key, label}) => (
              <button key={key} type="button" onClick={() => setActiveTab(key as any)}
                style={{ padding: "10px 18px", background: "transparent", border: "none", borderBottom: activeTab === key ? `2px solid ${theme.tabActive}` : "2px solid transparent", cursor: "pointer", fontSize: 14, fontWeight: activeTab === key ? 600 : 400, color: activeTab === key ? theme.tabActive : theme.tabInactive, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", marginBottom: -1, whiteSpace: "nowrap" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>

          {activeTab === "ideas" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em", margin: 0 }}>All Ideas</h2>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{rows.length} {rows.length === 1 ? "idea" : "ideas"} analyzed</div>
                </div>
                <Link href="/analyze" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", background: theme.ctaBg, color: theme.ctaText, borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  {t.new_analysis}
                </Link>
              </div>
              <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 48px", padding: "10px 20px", borderBottom: `1px solid ${theme.divider}`, background: D ? "#1a1a1d" : "#f9f9f9" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Idea</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Verdict</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Date</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Action</span>
                  <span></span>
                </div>
                {loading ? (
                  <div style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>Loading…</div>
                ) : rows.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>No ideas yet. Run your first analysis.</div>
                ) : rows.filter(row => {
                  const pid = projectByAnalysisId[row.id];
                  const proj = pid ? projects.find((p) => p.id === pid) : null;
                  const name = proj?.idea_name ?? row.idea;
                  if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  if (statusFilter !== "all" && getVerdictKind(row.verdict) !== statusFilter) return false;
                  return true;
                }).sort((a, b) => {
                  if (sortOrder === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  if (sortOrder === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                  const na = (projectByAnalysisId[a.id] ? projects.find(p => p.id === projectByAnalysisId[a.id])?.idea_name : null) ?? a.idea;
                  const nb = (projectByAnalysisId[b.id] ? projects.find(p => p.id === projectByAnalysisId[b.id])?.idea_name : null) ?? b.idea;
                  return na.localeCompare(nb);
                }).map((row, idx) => {
                  const kind = getVerdictKind(row.verdict);
                  const projectId = projectByAnalysisId[row.id];
                  const project = projectId ? projects.find((p) => p.id === projectId) : null;
                  const name = project?.idea_name ?? row.idea;
                  return (
                    <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 48px", padding: "14px 20px", borderBottom: idx < rows.length - 1 ? `1px solid ${theme.divider}` : "none", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name.length > 60 ? name.slice(0, 57) + "..." : name}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.idea.slice(0, 60)}…</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: kind === "BUILD" ? "#16a34a" : kind === "FLIP" ? "#ca8a04" : "#dc2626", background: "transparent", padding: "3px 10px", borderRadius: 100, display: "inline-block" }}>{kind}</span>
                      <span style={{ fontSize: 12, color: theme.textMuted }}>{new Date(row.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                      <Link href={"/verdict/" + row.id} style={{ fontSize: 12, fontWeight: 600, color: theme.text, textDecoration: "none", border: `1px solid ${theme.cardBorder}`, borderRadius: 6, padding: "5px 12px", display: "inline-block" }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
                        View →
                      </Link>
                      <button type="button" title="Delete" onClick={async () => {
                        if (!supabase) return;
                        if (!confirm("Delete this idea? This cannot be undone.")) return;
                        const deleted = rows.find(r => r.id === row.id);
                        await supabase.from("analyses").delete().eq("id", row.id);
                        setRows(prev => prev.filter(r => r.id !== row.id));
                        if (deleted) setDeletedRows(prev => [deleted, ...prev]);
                      }} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 6, border: `1px solid ${theme.cardBorder}`, background: "transparent", cursor: "pointer", color: "#ef4444", padding: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.borderColor = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = theme.cardBorder; }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(activeTab as string) === "trash" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em", margin: 0 }}>Recently Deleted</h2>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>Ideas deleted this session. Refresh clears this list.</div>
                </div>
                {deletedRows.length > 0 && <button type="button" onClick={() => setDeletedRows([])} style={{ fontSize: 12, color: theme.textMuted, background: "none", border: `1px solid ${theme.cardBorder}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>Clear all</button>}
              </div>
              {deletedRows.length === 0 ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: theme.textMuted, fontSize: 14 }}>No recently deleted ideas.</div>
              ) : (
                <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px", padding: "10px 20px", borderBottom: `1px solid ${theme.divider}`, background: D ? "#1a1a1d" : "#f9f9f9" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Idea</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Verdict</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Date</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Restore</span>
                  </div>
                  {deletedRows.map((row, idx) => {
                    const kind = getVerdictKind(row.verdict);
                    return (
                      <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px", padding: "14px 20px", borderBottom: idx < deletedRows.length - 1 ? `1px solid ${theme.divider}` : "none", alignItems: "center" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.idea.length > 60 ? row.idea.slice(0, 57) + "..." : row.idea}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: kind === "BUILD" ? "#16a34a" : kind === "FLIP" ? "#ca8a04" : "#dc2626" }}>{kind}</span>
                        <span style={{ fontSize: 12, color: theme.textMuted }}>{new Date(row.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                        <button type="button" onClick={async () => {
                          if (!supabase) return;
                          await supabase.from("analyses").insert(row);
                          setRows(prev => [row, ...prev]);
                          setDeletedRows(prev => prev.filter(r => r.id !== row.id));
                        }} style={{ fontSize: 12, fontWeight: 600, color: "#16a34a", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", width: "fit-content" }}>Restore</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "workspaces" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em", margin: 0 }}>{t.workspaces}</h2>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{projects.length} active {projects.length === 1 ? "project" : "projects"}</div>
                </div>
              </div>
              {(() => {
                const filtered = projects.filter(p => {
                  if (statusFilter === "all") return true;
                  if (statusFilter === "BUILD") return p.status === "building";
                  if (statusFilter === "FLIP") return p.status === "pivoting";
                  if (statusFilter === "KILL") return p.status === "killed";
                  return true;
                });
                const statusLabel = statusFilter === "BUILD" ? "building" : statusFilter === "FLIP" ? "pivoting" : statusFilter === "KILL" ? "killed" : "";
                if (projects.length === 0) return (
                  <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "60px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 6 }}>No workspaces yet</div>
                    <div style={{ fontSize: 13, color: theme.textMuted }}>Get a BUILD IT or FLIP IT verdict to create a workspace.</div>
                  </div>
                );
                if (filtered.length === 0) return (
                  <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "60px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 6 }}>No {statusLabel} workspaces</div>
                    <div style={{ fontSize: 13, color: theme.textMuted }}>No {statusLabel} projects for the moment.</div>
                  </div>
                );
                return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                  {filtered.map((project) => (
                    <div key={project.id} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "20px 24px", background: "transparent", position: "relative" }}
                      className="kly-ws-card">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: project.status === "building" ? "#4ade80" : project.status === "pivoting" ? "#f5c842" : "#f87171", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 400, color: theme.textSub, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>{project.status === "building" ? "Building" : project.status === "pivoting" ? "Pivoting" : "Killed"}</span>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); void handleDeleteProject(project.id); }}
                          style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ccc", padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "#ccc"; }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                      <Link href={"/project/" + project.id} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 6, lineHeight: 1.4 }}>{project.idea_name.length > 50 ? project.idea_name.slice(0, 47) + "..." : project.idea_name}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                          {t.open_workspace}
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
                );
              })()}
            </div>
          )}

          {activeTab === "settings" && (
            <div style={{ maxWidth: 520 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em", margin: "0 0 4px" }}>{t.settings_title}</h2>
              <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 28 }}>{t.settings_desc}</div>

              {/* Dark mode toggle */}
              <div style={{ padding: "20px 24px", border: `1px solid ${theme.cardBorder}`, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{t.appearance}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 14 }}>{t.appearance_desc}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[{val: false, label: t.light}, {val: true, label: t.dark}].map(({val, label}) => (
                    <button key={String(val)} type="button" onClick={() => {
                      setDarkMode(val);
                      localStorage.setItem("klayan_dark", val ? "1" : "0");
                    }} style={{ fontSize: 13, padding: "8px 20px", borderRadius: 8, border: darkMode === val ? "2px solid #111" : `1px solid ${theme.cardBorder}`, background: darkMode === val ? "#111" : "#fff", cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: darkMode === val ? 600 : 500, color: darkMode === val ? "#fff" : "#111" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "20px 24px", border: `1px solid ${theme.cardBorder}`, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{t.language}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12 }}>{t.language_desc}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{val: "en", label: t.english}, {val: "fr", label: t.français}].map(({val, label}) => (
                    <button key={val} type="button"
                      onClick={async () => {
                        localStorage.setItem("klayan_lang", val);
                        window.dispatchEvent(new StorageEvent("storage", { key: "klayan_lang", newValue: val }));
                        setSelectedLang(val as "en" | "fr");
                        window.dispatchEvent(new CustomEvent("klayan_lang_change", { detail: val }));
                        if (!user) return;
                        await supabase.from("profiles").update({ language: val }).eq("id", user.id);
                      }}
                      style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: selectedLang === val ? "2px solid #111" : `1px solid ${theme.cardBorder}`, background: selectedLang === val ? "#111" : "#fff", cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: selectedLang === val ? 600 : 500, color: selectedLang === val ? "#fff" : "#111" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "20px 24px", border: "1px solid #fecaca", borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{t.delete_account}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12 }}>{t.delete_account_desc}</div>
                <button type="button"
                  style={{ fontSize: 13, padding: "8px 18px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 600 }}
                  onClick={() => { if (confirm("Are you sure? This will permanently delete your account.")) alert("Contact support to delete your account."); }}>
                  Delete account
                </button>
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div style={{ maxWidth: 480 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em", margin: "0 0 4px" }}>{t.billing_title}</h2>
              <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 28 }}>{t.billing_desc2}</div>

              {/* Current plan */}
              <div style={{ padding: "20px 24px", border: `1px solid ${theme.cardBorder}`, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{t.current_plan}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: userPlan === "scale" ? "#16a34a" : "#f59e0b", background: userPlan === "scale" ? "#f0fdf4" : "#fefce8", padding: "2px 10px", borderRadius: 100, textTransform: "capitalize" }}>{userPlan}</span>
                </div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
                  {userPlan === "free" ? "1 free analysis. Upgrade to unlock more." : userPlan === "spark" ? "{t.unlimited_analyses}" : userPlan === "build" ? "$69/mo — all features." : "$149/mo — full access including Co-Founder Mode."}
                </div>
                {userPlan !== "scale" && (
                  <button type="button" onClick={() => { const priceId = getPriceIdForUpgrade(userPlan); if (!priceId) return; void handleUpgrade(priceId).catch(() => {}); }}
                    style={{ fontSize: 13, padding: "8px 18px", borderRadius: 8, border: "none", background: theme.ctaBg, color: theme.ctaText, cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 600 }}>
                    Upgrade plan →
                  </button>
                )}
              </div>

              {/* Payment method */}
              <div style={{ padding: "20px 24px", border: `1px solid ${theme.cardBorder}`, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{t.payment_method}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12 }}>{t.payment_desc}</div>
                <button type="button" onClick={async () => { const res = await fetch("/api/billing-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user?.id }) }); const data = await res.json(); if (data.url) window.open(data.url, "_blank"); }}
                  style={{ fontSize: 13, padding: "8px 18px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 500, color: theme.text }}>
                  Manage billing →
                </button>
              </div>

              {/* Cancel */}
              {userPlan !== "free" && (
                <div style={{ padding: "20px 24px", border: "1px solid #fecaca", borderRadius: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{t.cancel_subscription}</div>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12 }}>{t.cancel_desc}</div>
                  <button type="button" onClick={async () => { const res = await fetch("/api/billing-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user?.id }) }); const data = await res.json(); if (data.url) window.open(data.url, "_blank"); }}
                    style={{ fontSize: 13, padding: "8px 18px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 600 }}>
                    Cancel plan
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "profile" && (
            <div style={{ maxWidth: 480 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, letterSpacing: "-0.02em", margin: "0 0 4px" }}>{t.profile_title}</h2>
              <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 28 }}>Manage your account information.</div>

              {/* Avatar */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, padding: "20px 24px", border: `1px solid ${theme.cardBorder}`, borderRadius: 12 }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                  {avatarUrl ? (
                    <img key={avatarImgKey} src={avatarUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover" }} />
                  ) : (
                    <span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>
                      {(profileUsername?.trim() || user?.email?.split("@")[0] || "K")[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Profile photo</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => openAvatarFilePicker()}
                      style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: "pointer", color: theme.text, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
                      {avatarUrl ? "Change" : "Upload"}
                    </button>
                    {avatarUrl && (
                      <button type="button" onClick={() => void removeAvatar()}
                        style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "1px solid #fecaca", background: theme.card, cursor: "pointer", color: "#ef4444", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Username */}
              <div style={{ padding: "20px 24px", border: `1px solid ${theme.cardBorder}`, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 8 }}>{t.username}</div>
                <input type="text" defaultValue={profileUsername ?? ""} id="profile-username-input"
                  style={{ width: "100%", padding: "9px 12px", border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 14, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", color: theme.text, background: theme.inputBg, outline: "none", boxSizing: "border-box" }} />
                <button type="button" onClick={async () => {
                  const val = (document.getElementById("profile-username-input") as HTMLInputElement)?.value?.trim();
                  if (!val || !user) return;
                  await supabase.from("profiles").update({ username: val }).eq("id", user.id);
                  setProfileUsername(val);
                }}
                  style={{ marginTop: 10, fontSize: 13, padding: "8px 18px", borderRadius: 8, border: "none", background: theme.ctaBg, color: theme.ctaText, cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 600 }}>
                  Save
                </button>
              </div>

              {/* Email */}
              <div style={{ padding: "20px 24px", border: `1px solid ${theme.cardBorder}`, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Email</div>
                <div style={{ fontSize: 14, color: theme.textMuted }}>{user?.email}</div>
              </div>

              {/* Sign out */}
              <div style={{ padding: "20px 24px", border: "1px solid #fecaca", borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{t.sign_out}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12 }}>{t.sign_out_desc}</div>
                <button type="button" onClick={() => { void supabase.auth.signOut().then(() => router.push("/auth")); }}
                  style={{ fontSize: 13, padding: "8px 18px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", fontWeight: 600 }}>
                  Sign out
                </button>
              </div>
            </div>
          )}

          {activeTab === "home" && (<div>

          {/* Draft card */}
          {dashHasDraft && (
            <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", background: theme.card }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: theme.activeNav, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 2 }}>Draft in progress</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>You left an analysis unfinished. Pick up where you left off.</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={() => { localStorage.removeItem("klayan_analyze_draft"); setDashHasDraft(false); }} style={{ fontSize: 12, color: theme.textMuted, background: "none", border: "none", cursor: "pointer", padding: "6px 10px" }}>Discard</button>
                <a href="/analyze?resume=1" style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: theme.text, borderRadius: 8, padding: "7px 14px", textDecoration: "none" }}>Resume →</a>
              </div>
            </div>
          )}

          {/* Stats cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
            {/* Card 1 */}
            <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 500 }}>{t.ideas_analyzed}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: theme.text, letterSpacing: "-0.04em", marginBottom: 6 }}>{stats.total}</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{t.total_analyses}</div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#16a34a" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                {t.all_time}
              </div>
            </div>

            {/* Card 2 */}
            <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 500 }}>{t.verdicts_title}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: theme.text, letterSpacing: "-0.04em", marginBottom: 6 }}>
                <span style={{ color: "#4ade80" }}>{stats.build}</span>
                <span style={{ fontSize: 16, color: "#ccc", margin: "0 6px" }}>·</span>
                <span style={{ color: "#f5c842" }}>{stats.flip}</span>
                <span style={{ fontSize: 16, color: "#ccc", margin: "0 6px" }}>·</span>
                <span style={{ color: "#ef4444" }}>{stats.kill}</span>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{t.build_flip_kill}</div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.textMuted }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {t.across_all}
              </div>
            </div>

            {/* Card 3 */}
            <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 500 }}>{t.your_plan}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: theme.text, letterSpacing: "-0.04em", marginBottom: 6, textTransform: "capitalize" }}>{userPlan}</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{t.current_sub}</div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.textMuted }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                {userPlan === "scale" ? t.full_access : t.upgrade_available}
              </div>
            </div>
          </div>

          {/* Recent Ideas */}
          <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: `1px solid ${theme.divider}`, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.textSub} strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{t.recent_ideas}</span>
              <span style={{ fontSize: 13, color: theme.textMuted, marginLeft: 4 }}>({stats.total})</span>
            </div>
            {loading ? (
              <div style={{ padding: "40px 24px", textAlign: "center", color: theme.textMuted, fontSize: 14 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", color: theme.textMuted, fontSize: 14 }}>No ideas yet. Run your first analysis.</div>
            ) : rows.filter(row => {
              const pid = projectByAnalysisId[row.id];
              const proj = pid ? projects.find((p) => p.id === pid) : null;
              const name = proj?.idea_name ?? row.idea;
              if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
              if (statusFilter !== "all" && getVerdictKind(row.verdict) !== statusFilter) return false;
              return true;
            }).sort((a, b) => {
              if (sortOrder === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              if (sortOrder === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
              const na = (projectByAnalysisId[a.id] ? projects.find(p => p.id === projectByAnalysisId[a.id])?.idea_name : null) ?? a.idea;
              const nb = (projectByAnalysisId[b.id] ? projects.find(p => p.id === projectByAnalysisId[b.id])?.idea_name : null) ?? b.idea;
              return na.localeCompare(nb);
            }).map((row, idx, arr) => {
              const kind = getVerdictKind(row.verdict);
              const projectId = projectByAnalysisId[row.id];
              const project = projectId ? projects.find((p) => p.id === projectId) : null;
              const name = project?.idea_name ?? row.idea;
              return (
                <Link key={row.id} href={"/verdict/" + row.id}
                  style={{ display: "flex", alignItems: "center", padding: "14px 24px", borderBottom: idx < rows.length - 1 ? `1px solid ${theme.divider}` : "none", textDecoration: "none", color: "inherit", gap: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="18" fill="#1c1c1e"/><rect x="18" y="10" width="42" height="52" rx="6" fill="#c8c8c8"/><rect x="26" y="6" width="42" height="52" rx="6" fill="#d8d8d8"/><rect x="34" y="2" width="42" height="52" rx="6" fill="#efefef"/><rect x="34" y="2" width="42" height="52" rx="6" fill="url(#doc_lines)"/><defs><pattern id="doc_lines" patternUnits="userSpaceOnUse" x="34" y="18" width="42" height="36"><line x1="6" y1="0" x2="30" y2="0" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"/><line x1="6" y1="6" x2="26" y2="6" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"/><line x1="6" y1="12" x2="22" y2="12" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"/></pattern></defs><rect x="12" y="48" width="76" height="46" rx="8" fill="#2a2a2e"/><path d="M12 62 Q12 48 26 48 H74 Q88 48 88 62 V94 Q88 94 74 94 H26 Q12 94 12 94 Z" fill="url(#folder_grad)"/><defs><linearGradient id="folder_grad" x1="50" y1="48" x2="50" y2="94" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#5a5a5e"/><stop offset="100%" stopColor="#1c1c1e"/></linearGradient></defs></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name.length > 60 ? name.slice(0, 57) + "..." : name}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{new Date(row.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: kind === "BUILD" ? "#16a34a" : kind === "FLIP" ? "#ca8a04" : "#dc2626", background: "transparent", padding: "3px 10px", borderRadius: 100 }}>{kind}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              );
            })}
          </div>

          </div>)}
        </div>
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
                fontFamily: "'Europa Grotesk No 2 SH', sans-serif",
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
                style={{ background: theme.card, color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1 }}
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
            fontFamily: "'Europa Grotesk No 2 SH', sans-serif",
            color: "#fff",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          }}
        >
          Copied!
        </div>
      ) : null}

      {showWorkspaces ? (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            zIndex: 2000,
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
                  <a
                    key={project.id}
                    href={"/project/" + project.id}
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
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {(() => { const words = project.idea_name.split(" "); return words.length > 5 ? words.slice(0, 5).join(" ") + "..." : project.idea_name; })()}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>→</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
