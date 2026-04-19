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
      <span style={{ fontSize: 13, fontWeight: 500, color: "#aaa", fontFamily: "'DM Sans', 'Europa Grotesk No 2 SH', sans-serif" }}>
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
    if (!supabase) return;
    const sb = supabase;
    void sb.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setNotifications(data);
    });
    const channel = sb.channel("notifications").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
      void sb.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
        if (data) setNotifications(data);
      });
    }).subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    void supabase!.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setNotifications(data);
    });
    const channel = supabase!.channel("notifications").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
      void supabase!.from("notifications").select("*").order("created_at", { ascending: false }).then(({ data }) => {
        if (data) setNotifications(data);
      });
    }).subscribe();
    return () => { void supabase!.removeChannel(channel); };
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
      } = await supabase!.auth.getSession();

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
      } = await supabase!.auth.getUser();
      if (!authUser) return;

      const parts = file.name.split(".");
      const fileExt =
        parts.length > 1 && parts[parts.length - 1]?.trim()
          ? parts[parts.length - 1].toLowerCase()
          : "jpg";
      const filePath = `${authUser.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase!.storage
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
      } = supabase!.storage.from("avatars").getPublicUrl(filePath);

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

      const { data: folderFiles, error: listError } = await supabase!.storage
        .from("avatars")
        .list(user.id);

      if (listError) {
        console.warn("Dashboard: avatar storage list", listError);
      } else if (folderFiles?.length) {
        const { error: removeError } = await supabase!.storage
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
    await supabase!.from("projects").delete().eq("id", projectId);
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
    await supabase!.from("projects").update({ idea_name: newName.trim() }).eq("id", projectId);
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
    fontFamily: "'DM Sans', 'Europa Grotesk No 2 SH', sans-serif",
    fontWeight: 600,
