"use client";

import { handlePaywallResponse } from "@/lib/plan-upgrade-events";
import { UpgradeNudge } from "@/components/PlanLock";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { getCampaigns } from "@/lib/db";
import { addMeetingForUser, addTaskForUser } from "@/lib/assistant-actions";
import { isDashboardView, type DashboardView } from "@/lib/dashboard-view-storage";
import {
  createMinoChat,
  displayMinoChatTitle,
  getActiveMinoChatId,
  loadMinoChats,
  MINO_ACTIVE_EVENT,
  MINO_CHATS_EVENT,
  MINO_PENDING_EVENT,
  setActiveMinoChatId,
  takePendingMinoPrompt,
  titleFromMessage,
  upsertMinoChat,
  type MinoChat,
  type MinoChatMessage,
} from "@/lib/mino-chats-storage";
import { MinoCompanion } from "@/components/MinoCompanion";
import { describeSearch, parseCreatorSearch } from "@/lib/mino-search-parse";
import { describeRevenueAsk, looksLikeAction, parseRevenueAsk, type MinoRevenueAsk } from "@/lib/mino-revenue-parse";
import { loadRevenueSnapshot, type MinoRevenueSnapshot, type MinoWidget } from "@/lib/mino-widgets";
import type { DashboardNavState } from "@/lib/dashboard-navigation";
import type { FeedCreator } from "@/lib/discovery-feed";
import { MinoCreatorResults, MinoSearchMotion } from "./MinoCreatorResults";
import { MinoActionWidget, MinoErrorWidget, MinoRevenueLoading, MinoRevenueWidget, viewLabel } from "./MinoWidgets";
import { formatMoney } from "./SampleCampaignPreview";
import { useDashboardNavigationOptional } from "./DashboardNavigationProvider";
import { MinoAttachButtons, MinoAttachChips, MinoDropHint, useMinoAttachments, GlobeIcon, ImageIcon } from "./MinoAttachments";
import { MinoAnalysisResult, MinoWiderSearches } from "./MinoAnalysisResult";
import {
  setPendingCatalogFilters,
  takePendingMinoAttachments,
  type MinoImageAttachment,
} from "@/lib/mino-attachments";
import type { MinoAnalysisMeta } from "@/lib/mino-analysis";
import type { MinoCatalogFilters } from "@/lib/mino-filters";
import { findSiteUrl } from "@/lib/mino-url-safety";

const MINO_TYPE_LINES = {
  en: [
    "Which creator are we looking for today?",
    "Manage my creators",
    "Find influencers in any niche",
    "Start an outreach",
    "Track a campaign",
    "Send a gift",
    "See which video is due",
    "Pay a creator",
  ],
  fr: [
    "Quel créateur on cherche aujourd’hui ?",
    "Gérer mes créateurs",
    "Trouver des influenceurs, n’importe quelle niche",
    "Lancer un outreach",
    "Suivre une campagne",
    "Envoyer un cadeau",
    "Voir quelle vidéo est due",
    "Payer un créateur",
  ],
};

function MinoTypeLine({ fr }: { fr: boolean }) {
  const lines = fr ? MINO_TYPE_LINES.fr : MINO_TYPE_LINES.en;
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const full = lines[index] || "";

  useEffect(() => {
    const done = deleting ? count === 0 : count >= full.length;
    const delay = done ? (deleting ? 420 : 2400) : deleting ? 48 : 92;
    const timer = window.setTimeout(() => {
      if (!deleting && count >= full.length) {
        setDeleting(true);
        return;
      }
      if (deleting && count === 0) {
        setDeleting(false);
        setIndex((i) => (i + 1) % lines.length);
        return;
      }
      setCount((n) => n + (deleting ? -1 : 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [count, deleting, full.length, lines.length]);

  const lastWordAt = full.lastIndexOf(" ") + 1;
  const shown = full.slice(0, count);
  const lead = shown.slice(0, Math.min(shown.length, lastWordAt));
  const accent = shown.length > lastWordAt ? shown.slice(lastWordAt) : "";

  return (
    <h1 className="ai-hero__title ai-hero__type" aria-live="polite">
      <span>{lead}</span>
      {accent ? <span className="ai-hero__accent">{accent}</span> : null}
      <span className="ai-hero__caret" aria-hidden />
    </h1>
  );
}

type AiCommand =
  | { action: "create_meeting"; title: string; when: string; withWho: string; say: string }
  | { action: "create_task"; title: string; due: string; say: string }
  | { action: "pay_creator"; creator: string; amount: number | null; say: string }
  | { action: "create_campaign"; say: string }
  | { action: "navigate"; view: string; say: string }
  | { action: "clarify"; question: string }
  | { action: "chat"; reply: string };

type PayableCreator = { id: string; name: string; handle: string };

function localNowInput(): { now: string; weekday: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    now: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

function formatWhen(when: string, fr: boolean): string {
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return when;
  return d.toLocaleString(fr ? "fr-FR" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Mino's sentence above a revenue widget: only the figures of the snapshot. */
function revenueReply(s: MinoRevenueSnapshot, fr: boolean): string {
  const lang = fr ? "fr" : "en";
  const lead =
    s.ask.days === 1 ? (fr ? "Aujourd’hui" : "Today") : fr ? `Sur les ${s.ask.days} derniers jours` : `Over the last ${s.ask.days} days`;
  const withWho = s.creator ? (fr ? ` avec ${s.creator.name}` : ` with ${s.creator.name}`) : "";
  const joined = s.joined?.length ?? 0;
  const joinedLine =
    s.ask.focus === "new" && s.joined
      ? fr
        ? ` ${joined} nouveau${joined > 1 ? "x" : ""} créateur${joined > 1 ? "s" : ""} sur la période.`
        : ` ${joined} new creator${joined === 1 ? "" : "s"} in this period.`
      : "";
  if (s.status === "unknown_creator") {
    return fr
      ? `Je ne trouve pas « ${s.ask.creator} » parmi vos créateurs.`
      : `I can’t find “${s.ask.creator}” among your creators.`;
  }
  if (s.status === "empty") {
    return (fr ? `${lead}, aucune vente enregistrée${withWho}.` : `${lead}, no sales recorded${withWho}.`) + joinedLine;
  }
  const orders = fr
    ? `${s.orders} commande${s.orders > 1 ? "s" : ""}`
    : `${s.orders} order${s.orders === 1 ? "" : "s"}`;
  const topLine =
    s.ask.focus === "top" && s.top[0]
      ? fr
        ? ` En tête : ${s.top[0].name} (${formatMoney(s.top[0].revenue, lang)}).`
        : ` Leading: ${s.top[0].name} (${formatMoney(s.top[0].revenue, lang)}).`
      : "";
  return (
    (fr
      ? `${lead}, vous avez généré ${formatMoney(s.revenue, lang)}${withWho}, en ${orders}.`
      : `${lead}, you generated ${formatMoney(s.revenue, lang)}${withWho} from ${orders}.`) +
    topLine +
    joinedLine
  );
}

type AssistantAnswer = { content: string; widget?: MinoWidget };

type SubmitOptions = { image?: MinoImageAttachment | null; site?: string | null };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** What the user sees when the analysis route answers with a known error (no fake output). */
function analyzeErrorText(code: string, fr: boolean, siteHost?: string): string | null {
  switch (code) {
    case "plan_required":
      return fr
        ? "L’analyse de votre site ou de votre photo est incluse dès le plan Growth (analyses illimitées). Vous pouvez quand même me décrire votre marque, par exemple « créatrices skincare en France »."
        : "Site and photo analysis comes with the Growth plan (unlimited analyses). You can still describe your brand, for example “skincare creators in France”.";
    case "rate_limited":
      return fr
        ? "Vous avez lancé beaucoup d’analyses en une heure. Réessayez dans quelques minutes."
        : "You ran a lot of analyses within an hour. Try again in a few minutes.";
    case "ai_unavailable":
      return fr
        ? `L’analyse par l’IA n’est pas disponible sur ce serveur pour l’instant (clé Anthropic absente)${siteHost ? `. J’ai bien pu lire votre site (${siteHost})` : ""}. Vous pouvez quand même me décrire votre marque, par exemple « créatrices skincare en France avec un email ».`
        : `AI analysis isn’t available on this server right now (no Anthropic key)${siteHost ? `. I could read your site (${siteHost})` : ""}. You can still describe your brand, for example “skincare creators in France with an email”.`;
    case "site_blocked":
    case "site_invalid_url":
      return fr ? "Je ne peux pas ouvrir cette adresse : seuls les sites web publics (http ou https) sont acceptés." : "I can’t open that address: only public websites (http or https) are allowed.";
    case "site_social":
      return fr ? "C’est un lien de réseau social. Donnez-moi le site de votre marque, ou une photo de votre produit." : "That’s a social media link. Give me your brand’s website, or a photo of your product.";
    case "site_timeout":
      return fr ? "Votre site met trop de temps à répondre (plus de 8 secondes). Réessayez, ou envoyez une photo de votre produit." : "Your site took too long to answer (over 8 seconds). Try again, or send a photo of your product.";
    case "site_unreachable":
    case "site_http_error":
      return fr ? "Je n’arrive pas à ouvrir votre site. Vérifiez l’adresse, ou envoyez une photo de votre produit." : "I can’t open your site. Check the address, or send a photo of your product.";
    case "site_protected":
      return fr
        ? "Votre site bloque les visites automatiques, je ne peux pas le lire. Envoyez-moi une photo de votre produit, ou décrivez votre marque en une phrase."
        : "Your site blocks automated visits, so I can’t read it. Send me a photo of your product, or describe your brand in one sentence.";
    case "site_not_html":
      return fr ? "Cette adresse n’est pas une page web. Donnez-moi la page d’accueil de votre site." : "That address isn’t a web page. Give me your site’s home page.";
    case "site_too_large":
      return fr ? "Cette page est trop lourde à lire. Essayez la page d’accueil." : "That page is too large to read. Try the home page.";
    case "image_too_large":
      return fr ? "Photo trop lourde : 5 Mo maximum." : "Photo too large: 5 MB maximum.";
    case "image_type":
    case "image_invalid":
      return fr ? "Ce fichier n’est pas une photo lisible (JPG, PNG, WebP ou HEIC)." : "That file isn’t a readable photo (JPG, PNG, WebP or HEIC).";
    case "image_heic":
      return fr ? "Je n’arrive pas à convertir cette photo HEIC. Exportez-la en JPG puis réessayez." : "I couldn’t convert this HEIC photo. Export it as JPG and try again.";
    case "analysis_refused":
      return fr ? "Je ne peux pas analyser ce contenu." : "I can’t analyse this content.";
    default:
      return null;
  }
}

function matchCreator(list: PayableCreator[], query: string): PayableCreator | null {
  const q = query.toLowerCase().replace(/^@/, "").trim();
  if (!q) return null;
  const norm = (s: string) => s.toLowerCase().replace(/^@/, "").trim();
  return (
    list.find((c) => norm(c.name) === q || norm(c.handle) === q) ||
    list.find(
      (c) =>
        (c.name && (norm(c.name).includes(q) || q.includes(norm(c.name)))) ||
        (c.handle && (norm(c.handle).includes(q) || q.includes(norm(c.handle)))),
    ) ||
    null
  );
}

export function AiChatView({
  isMobile,
  onNavigate,
  userId,
  isCreator,
  onReachOut,
  isPaid,
  onUpgrade,
}: {
  isMobile?: boolean;
  onNavigate: (view: DashboardView) => void;
  displayName?: string | null;
  userId?: string;
  isCreator?: boolean;
  /** Opens Outreach prefilled with this creator. */
  onReachOut?: (creator: FeedCreator) => void;
  /** Paid plans can save creators into lists. */
  isPaid?: boolean;
  onUpgrade?: () => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const dashNav = useDashboardNavigationOptional();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const creatorsRef = useRef<PayableCreator[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [pendingContext, setPendingContext] = useState<string | null>(null);
  const [campaignNames, setCampaignNames] = useState<string[]>([]);
  const [chatMode, setChatMode] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<MinoChatMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [chats, setChats] = useState<MinoChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  /** What Mino is doing while busy: the search motion, the dashboard skeleton, or "thinking". */
  const [busyView, setBusyView] = useState<{ kind: "search" | "revenue" | "think" | "analyze"; label: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastTurnRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<(raw: string, opts?: SubmitOptions) => Promise<void>>(async () => {});
  const att = useMinoAttachments(prompt);

  const go = (state: DashboardNavState) => {
    if (dashNav) dashNav.navigate(state);
    else onNavigate(state.view);
  };

  /** "Open in Creators with these filters": Creators > Search picks them up when it shows. */
  const openCatalogWith = (filters?: MinoCatalogFilters) => {
    if (filters) setPendingCatalogFilters(filters);
    go({ view: "discovery" });
  };

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId],
  );

  const refreshChats = () => {
    const list = loadMinoChats(userId);
    setChats(list);
    const active = getActiveMinoChatId(userId);
    if (active && list.some((c) => c.id === active)) {
      setActiveChatId(active);
      return active;
    }
    return null;
  };

  useEffect(() => {
    const active = refreshChats();
    if (active) {
      const chat = loadMinoChats(userId).find((c) => c.id === active);
      if (chat && chat.messages.length > 0) {
        setChatMode(true);
        setMessages(chat.messages);
      }
    }
    const onChats = () => refreshChats();
    const onActive = () => {
      const id = getActiveMinoChatId(userId);
      setActiveChatId(id);
      setDropdownOpen(false);
      setStatus("");
      if (!id) {
        setChatMode(false);
        setMessages([]);
        return;
      }
      const chat = loadMinoChats(userId).find((c) => c.id === id);
      if (!chat) return;
      setChatMode(chat.messages.length > 0);
      setMessages(chat.messages);
    };
    window.addEventListener(MINO_CHATS_EVENT, onChats);
    window.addEventListener(MINO_ACTIVE_EVENT, onActive);
    return () => {
      window.removeEventListener(MINO_CHATS_EVENT, onChats);
      window.removeEventListener(MINO_ACTIVE_EVENT, onActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || isCreator) {
      setCampaignNames([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getCampaigns(userId);
        if (cancelled) return;
        const names = (rows || [])
          .map((r) => String((r as { name?: string }).name || "").trim())
          .filter(Boolean)
          .slice(0, 6);
        setCampaignNames(names);
      } catch {
        if (!cancelled) setCampaignNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isCreator]);

  const suggestions = useMemo(() => {
    if (isCreator) {
      return fr
        ? [
            "Ouvre mes analytiques",
            "Montre mon solde / Pay it",
            "Ouvre Contenu pour poster une vidéo",
            "Ouvre la Communauté",
            "Ouvre les infos de la marque",
          ]
        : [
            "Open my analytics",
            "Show my balance / Pay it",
            "Open Content to post a video",
            "Open Community",
            "Open brand infos",
          ];
    }

    const firstCampaign = campaignNames[0];
    const chips: string[] = [];

    if (fr) {
      chips.push("Trouver des créateurs beauté");
      chips.push("Combien j’ai généré cette semaine ?");
      chips.push("Paye un créateur");
      chips.push("Crée une tâche : relancer les créateurs");
      if (firstCampaign) chips.push(`Ouvre la campagne « ${firstCampaign} »`);
      else chips.push("Crée une nouvelle campagne");
      chips.push("Ouvre Inbox");
    } else {
      chips.push("Discover beauty creators");
      chips.push("How much did I make this week?");
      chips.push("Pay a creator");
      chips.push("Create a task: follow up with creators");
      if (firstCampaign) chips.push(`Open campaign “${firstCampaign}”`);
      else chips.push("Create a new campaign");
      chips.push("Open Inbox");
    }

    return chips.slice(0, 5);
  }, [fr, campaignNames, isCreator]);

  useEffect(() => {
    if (!chatMode) return;
    const last = messages[messages.length - 1];
    // A built answer (profiles, dashboard) is read from its top, not its bottom.
    if (!chatBusy && last?.role === "assistant" && (last.widget?.kind === "revenue" || last.creators?.length)) {
      lastTurnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMode, messages, chatBusy]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [dropdownOpen]);

  const persistMessages = (chatId: string, nextMessages: MinoChatMessage[], titleSeed?: string) => {
    const existing = loadMinoChats(userId).find((c) => c.id === chatId);
    const title =
      existing?.messages.length
        ? existing.title
        : titleSeed
          ? titleFromMessage(titleSeed, fr)
          : existing?.title || (fr ? "Nouvelle conversation" : "New chat");
    const chat: MinoChat = {
      id: chatId,
      title,
      messages: nextMessages,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    upsertMinoChat(userId, chat);
    setChats(loadMinoChats(userId));
    setActiveChatId(chatId);
  };

  const enterChatMode = () => {
    setChatMode(true);
    setStatus("");
    setPendingContext(null);
    if (!activeChatId) {
      const chat = createMinoChat(userId, fr);
      setActiveChatId(chat.id);
      setMessages([]);
      setChats(loadMinoChats(userId));
    }
    textareaRef.current?.focus();
  };

  const exitChatMode = () => {
    setChatMode(false);
    setStatus("");
    setPendingContext(null);
    setDropdownOpen(false);
    textareaRef.current?.focus();
  };

  const toggleChatMode = () => {
    if (chatMode) exitChatMode();
    else enterChatMode();
  };

  const openChat = (chatId: string) => {
    const chat = loadMinoChats(userId).find((c) => c.id === chatId);
    if (!chat) return;
    setActiveMinoChatId(userId, chatId);
    setActiveChatId(chatId);
    setMessages(chat.messages);
    setChatMode(chat.messages.length > 0);
    setStatus("");
    setDropdownOpen(false);
    textareaRef.current?.focus();
  };

  const startNewChat = () => {
    const chat = createMinoChat(userId, fr);
    setActiveChatId(chat.id);
    setMessages([]);
    setChats(loadMinoChats(userId));
    setChatMode(false);
    setStatus("");
    setDropdownOpen(false);
    setPrompt("");
    textareaRef.current?.focus();
  };

  const ensureCreators = async (): Promise<PayableCreator[]> => {
    if (creatorsRef.current) return creatorsRef.current;
    if (!userId) return [];
    try {
      const res = await fetch(`/api/creators-list?userId=${userId}`, { credentials: "include" });
      const data = (await res.json()) as Array<{ id?: string; full_name?: string; handle?: string }>;
      const list = Array.isArray(data)
        ? data
            .map((c) => ({
              id: String(c.id || ""),
              name: String(c.full_name || "").trim(),
              handle: String(c.handle || "").trim(),
            }))
            .filter((c) => c.id)
        : [];
      creatorsRef.current = list;
      return list;
    } catch {
      return [];
    }
  };

  /** Runs an action from /api/ai-command and says what was done, with a card to open it. */
  const runCommand = (cmd: AiCommand, text: string, creators: PayableCreator[]): AssistantAnswer => {
    const at = Date.now();
    const askMore = (question: string): AssistantAnswer => {
      setPendingContext((prev) => `${prev ? `${prev}\n` : ""}User: ${text}\nAssistant: ${question}`);
      return { content: question };
    };

    switch (cmd.action) {
      case "clarify":
        return askMore(cmd.question);

      case "create_meeting": {
        addMeetingForUser(userId, {
          title: cmd.title,
          when: cmd.when,
          withWho: cmd.withWho,
          notes: text,
        });
        setPendingContext(null);
        return {
          content:
            cmd.say ||
            (fr
              ? `C'est noté — « ${cmd.title} » ajouté ${formatWhen(cmd.when, true)}.`
              : `Done — “${cmd.title}” added ${formatWhen(cmd.when, false)}.`),
          widget: {
            kind: "action",
            action: {
              kind: "meeting",
              title: cmd.title,
              detail: [formatWhen(cmd.when, fr), cmd.withWho].filter(Boolean).join(" · "),
              view: "planner",
              at,
              autoOpen: false,
            },
          },
        };
      }

      case "create_task": {
        addTaskForUser(userId, cmd.title, cmd.due);
        setPendingContext(null);
        return {
          content: cmd.say || (fr ? `Tâche ajoutée : ${cmd.title}.` : `Task added: ${cmd.title}.`),
          widget: {
            kind: "action",
            action: {
              kind: "task",
              title: cmd.title,
              detail: cmd.due ? `${fr ? "Échéance" : "Due"} ${formatWhen(cmd.due, fr)}` : fr ? "Ajoutée à vos tâches" : "Added to your tasks",
              view: "tasks",
              at,
            },
          },
        };
      }

      case "pay_creator": {
        if (isCreator) {
          setPendingContext(null);
          return {
            content: cmd.say || (fr ? "J'ouvre Pay it." : "Opening Pay it."),
            widget: { kind: "action", action: { kind: "navigate", title: "Pay it", view: "payouts", at } },
          };
        }
        const found = matchCreator(creators, cmd.creator);
        if (!found) {
          const names = creators
            .slice(0, 4)
            .map((c) => c.name || c.handle)
            .filter(Boolean)
            .join(", ");
          return askMore(
            fr
              ? `Je ne trouve pas « ${cmd.creator} ». ${names ? `Vous voulez dire : ${names} ?` : "Quel créateur voulez-vous payer ?"}`
              : `I can't find “${cmd.creator}”. ${names ? `Did you mean: ${names}?` : "Which creator should I pay?"}`,
          );
        }
        setPendingContext(null);
        const label = found.name || found.handle;
        return {
          content: cmd.say || (fr ? `J'ouvre le paiement de ${label}.` : `Opening the payment for ${label}.`),
          widget: {
            kind: "action",
            action: {
              kind: "pay",
              title: fr ? `Payer ${label}` : `Pay ${label}`,
              detail: cmd.amount
                ? formatMoney(cmd.amount, lang, cmd.amount % 1 ? 2 : 0)
                : fr
                  ? "Montant à choisir dans Paiements"
                  : "Pick the amount in Payouts",
              view: "payouts",
              payoutCreatorId: found.id,
              at,
            },
          },
        };
      }

      case "create_campaign":
        setPendingContext(null);
        if (isCreator) {
          return {
            content: cmd.say || (fr ? "J'ouvre Contenu." : "Opening Content."),
            widget: { kind: "action", action: { kind: "navigate", title: fr ? "Contenu" : "Content", view: "content", at } },
          };
        }
        return {
          content: cmd.say || (fr ? "J'ouvre la création de campagne." : "Opening campaign creation."),
          widget: {
            kind: "action",
            action: {
              kind: "campaign",
              title: fr ? "Nouvelle campagne" : "New campaign",
              detail: fr ? "Affiliation, RPM ou cadeaux" : "Affiliate, RPM or gifting",
              view: "campaigns",
              at,
            },
          },
        };

      case "navigate": {
        setPendingContext(null);
        const say = cmd.say || (fr ? "J'ouvre ça." : "Opening it.");
        if (!isDashboardView(cmd.view)) return { content: say };
        const view = cmd.view as DashboardView;
        const label = viewLabel(view, lang);
        return {
          content: say,
          widget: {
            kind: "action",
            action: {
              kind: "navigate",
              title: fr ? `Ouvrir ${label}` : label,
              detail: fr ? "Mino ouvre la page pour vous" : "Mino is opening the page for you",
              view,
              at,
            },
          },
        };
      }

      case "chat":
        setPendingContext(null);
        return { content: cmd.reply };
    }
  };

  /** Asks /api/ai-command what to do. Throws on a network or server failure. */
  const askCommand = async (text: string): Promise<AssistantAnswer> => {
    const creators = isCreator ? [] : await ensureCreators();
    const { now, weekday } = localNowInput();
    const res = await fetch("/api/ai-command", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        context: pendingContext || "",
        lang: fr ? "fr" : "en",
        now,
        weekday,
        role: isCreator ? "creator" : "brand",
        creators: creators.map((c) => c.name || c.handle).filter(Boolean),
        campaigns: isCreator ? [] : campaignNames,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; command?: AiCommand };
    if (!res.ok || !data.ok || !data.command) throw new Error("bad response");
    return runCommand(data.command, text, creators);
  };

  /** Free conversation and creator searches. Throws on a network or server failure. */
  const askChat = async (history: MinoChatMessage[]): Promise<AssistantAnswer & Pick<MinoChatMessage, "creators" | "search">> => {
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Only the words: widgets and creator cards stay on this side.
        messages: history.filter((m) => m.widget?.kind !== "error").map((m) => ({ role: m.role, content: m.content })),
        lang: fr ? "fr" : "en",
        role: isCreator ? "creator" : "brand",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      reply?: string;
      creators?: FeedCreator[];
      search?: { label: string; sources: string[]; filters?: MinoCatalogFilters };
    };
    if (!res.ok || !data.ok || !data.reply) throw new Error(`ai-chat ${res.status}`);
    return {
      content: data.reply,
      // An empty search keeps its filters: the answer offers wider searches.
      ...(data.search ? { creators: data.creators ?? [], search: data.search } : {}),
    };
  };

  /** Website and/or photo analysis. Known failures answer in words; network or server errors throw (retry card). */
  const askAnalyze = async (
    text: string,
    image: MinoImageAttachment | null,
    site: string | null,
  ): Promise<AssistantAnswer & Pick<MinoChatMessage, "creators" | "search" | "analysis">> => {
    const res = await fetch("/api/mino/analyze", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        url: site,
        image: image ? { data: image.data, mediaType: image.mediaType, name: image.name } : null,
        lang: fr ? "fr" : "en",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      reply?: string;
      analysis?: MinoAnalysisMeta;
      creators?: FeedCreator[];
      search?: { label: string; sources: string[]; filters?: MinoCatalogFilters };
      site?: { host?: string } | null;
    };
    if (!res.ok || !data.ok) {
      handlePaywallResponse(res.status, data);
      const known = data.error ? analyzeErrorText(data.error, fr, data.site?.host) : null;
      if (known) return { content: known };
      throw new Error(`analyze ${res.status}`);
    }
    return {
      content: data.reply || "",
      analysis: data.analysis,
      creators: data.creators ?? [],
      search: data.search,
    };
  };

  const askRevenue = async (ask: MinoRevenueAsk): Promise<AssistantAnswer> => {
    if (!userId) throw new Error("no user");
    const snapshot = await loadRevenueSnapshot(userId, ask);
    return { content: revenueReply(snapshot, fr), widget: { kind: "revenue", snapshot } };
  };

  /**
   * Every ask lands in the thread. Revenue asks build a dashboard, creator
   * searches build profiles, actions build a card, the rest is conversation.
   * `base` replaces the current thread (a retry drops the failed turn first).
   */
  const submit = async (raw: string, base?: MinoChatMessage[], opts?: SubmitOptions) => {
    // Attachments: the prompt box's own, unless the caller says otherwise (chips, retries, Home).
    const image = isCreator ? null : opts && "image" in opts ? (opts.image ?? null) : att.image;
    const site = isCreator ? null : opts && "site" in opts ? (opts.site ?? null) : att.site;
    const analyze = Boolean(image || site);
    const text =
      raw.trim() ||
      (image
        ? fr
          ? "Analyse cette photo et trouve-moi des créateurs"
          : "Analyse this photo and find me creators"
        : site
          ? fr
            ? "Analyse mon site et trouve-moi des créateurs"
            : "Analyse my site and find me creators"
          : "");
    if (!text || chatBusy) return;

    const history = base ?? messages;
    const startingSession = !chatMode && !!activeChatId && history.length === 0;
    const revenueAsk = isCreator || analyze ? null : parseRevenueAsk(text);
    const creatorSearch = isCreator || revenueAsk || analyze ? null : parseCreatorSearch(text);
    const route: "analyze" | "revenue" | "search" | "command" | "chat" = analyze
      ? "analyze"
      : revenueAsk
      ? "revenue"
      : creatorSearch
        ? "search"
        : pendingContext || looksLikeAction(text) || (!chatMode && !startingSession)
          ? "command"
          : "chat";

    let chatId = activeChatId;
    if (!chatId) {
      // Creating the chat fires the "active chat" event, which resets the view
      // to an empty chat: switch to chat mode only after it.
      const created = createMinoChat(userId, fr, text);
      chatId = created.id;
      setActiveChatId(chatId);
      setChats(loadMinoChats(userId));
    }
    setChatMode(true);

    const attachments: NonNullable<MinoChatMessage["attachments"]> = [
      ...(image ? [{ kind: "image" as const, name: image.name, thumb: image.thumb || undefined }] : []),
      ...(site ? [{ kind: "site" as const, url: site }] : []),
    ];
    const userMessage: MinoChatMessage = attachments.length ? { role: "user", content: text, attachments } : { role: "user", content: text };
    const nextMessages: MinoChatMessage[] = [...history, userMessage];
    setMessages(nextMessages);
    persistMessages(chatId, nextMessages, text);
    setPrompt("");
    if (!opts) att.clear();
    setChatBusy(true);
    setStatus("");
    setBusyView(
      route === "analyze"
        ? { kind: "analyze", label: [site ? hostOf(site) : "", image ? "photo" : ""].filter(Boolean).join(" + ") }
        : route === "search" && creatorSearch
        ? { kind: "search", label: describeSearch(creatorSearch, lang) }
        : route === "revenue" && revenueAsk
          ? { kind: "revenue", label: describeRevenueAsk(revenueAsk, lang) }
          : { kind: "think", label: "" },
    );
    // Let the motion play in full even when the answer comes back fast.
    const minShow = new Promise((r) => window.setTimeout(r, route === "search" ? 2200 : route === "revenue" ? 900 : 0));

    let answer: MinoChatMessage;
    try {
      const result =
        route === "analyze"
          ? await askAnalyze(text, image, site)
          : route === "revenue" && revenueAsk
          ? await askRevenue(revenueAsk)
          : route === "command"
            ? await askCommand(text)
            : await askChat(nextMessages);
      await minShow;
      answer = { role: "assistant", ...result };
    } catch {
      await minShow;
      answer = {
        role: "assistant",
        content: fr ? `Je n’ai pas pu répondre à « ${text} ».` : `I couldn’t answer “${text}”.`,
        widget: { kind: "error", retryText: text },
      };
    }
    const withReply = [...nextMessages, answer];
    setMessages(withReply);
    persistMessages(chatId, withReply, text);
    setChatBusy(false);
    setBusyView(null);
  };
  submitRef.current = (raw: string, opts?: SubmitOptions) => submit(raw, undefined, opts);
  /** A suggested search from an answer: plain text, no attachments. */
  const runSuggested = (text: string) => void submit(text, undefined, { image: null, site: null });

  /** Drops the failed turn (question + error) and asks again. */
  const retry = (errorIndex: number) => {
    const failed = messages[errorIndex];
    if (failed?.widget?.kind !== "error") return;
    const cut = messages[errorIndex - 1]?.role === "user" ? errorIndex - 1 : errorIndex;
    void submit(failed.widget.retryText, messages.slice(0, cut), { image: null, site: findSiteUrl(failed.widget.retryText) });
  };

  /** Re-reads the numbers of a revenue widget in place. */
  const refreshRevenue = async (index: number) => {
    const msg = messages[index];
    if (msg?.widget?.kind !== "revenue" || !userId || !activeChatId) return;
    const chatId = activeChatId;
    try {
      const snapshot = await loadRevenueSnapshot(userId, msg.widget.snapshot.ask);
      // The thread may have moved on while loading: update that same widget only.
      const current = messagesRef.current;
      if (current[index]?.widget !== msg.widget) return;
      const next = current.map((m, i) =>
        i === index ? { ...m, content: revenueReply(snapshot, fr), widget: { kind: "revenue" as const, snapshot } } : m,
      );
      setMessages(next);
      persistMessages(chatId, next);
    } catch {
      // The widget keeps its last numbers; the refresh button stops spinning.
    }
  };

  // A prompt typed on Home is sent as soon as this view is shown.
  useEffect(() => {
    const consume = () => {
      const text = takePendingMinoPrompt(userId);
      const pending = takePendingMinoAttachments();
      if (text || pending) {
        void submitRef.current(text || "", {
          image: pending?.image ?? null,
          site: pending?.site ?? (text ? findSiteUrl(text) : null),
        });
      }
    };
    consume();
    window.addEventListener(MINO_PENDING_EVENT, consume);
    return () => window.removeEventListener(MINO_PENDING_EVENT, consume);
  }, [userId]);

  const dropdownLabel = (activeChat?.title && displayMinoChatTitle(activeChat.title, fr)) || (fr ? "Demander, construire, créer" : "Ask, Build, Create");

  return (
    <div className={`ai-page${isMobile ? " is-mobile" : ""}${chatMode ? " is-chat" : ""}${messages.length > 0 ? " is-thread" : ""}`}>
      <div className="ai-hero">
        {messages.length > 0 ? (
        <div className="ai-chat-head" ref={dropdownRef}>
          <button
            type="button"
            className={`ai-chat-dropdown${dropdownOpen ? " is-open" : ""}`}
            onClick={() => setDropdownOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            <span className="ai-chat-dropdown__label">{dropdownLabel}</span>
            <span className="ai-chat-dropdown__chev" aria-hidden>
              {dropdownOpen ? "▴" : "▾"}
            </span>
          </button>
          {dropdownOpen ? (
            <div className="ai-chat-dropdown__menu" role="listbox">
              <button type="button" className="ai-chat-dropdown__item is-new" onClick={startNewChat}>
                {fr ? "+ Nouvelle conversation" : "+ New chat"}
              </button>
              {chats.length === 0 ? (
                <div className="ai-chat-dropdown__empty">
                  {fr ? "Pas encore de chats avec Mino." : "No chats with Mino yet."}
                </div>
              ) : (
                chats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ai-chat-dropdown__item${c.id === activeChatId ? " is-active" : ""}`}
                    onClick={() => openChat(c.id)}
                  >
                    {displayMinoChatTitle(c.title, fr)}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        ) : null}

        {messages.length === 0 ? (
          <>
            <div className="ai-hero__mino">
              <MinoCompanion size={84} />
            </div>
            <MinoTypeLine fr={fr} />
          </>
        ) : null}

        {chatMode && messages.length > 0 ? (
          <div className="ai-chat-thread" aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                ref={i === messages.length - 1 ? lastTurnRef : undefined}
                className={`ai-chat-turn ai-chat-turn--${m.role}`}
              >
                {m.role === "user" && m.attachments?.length ? (
                  <div className="mino-msg-attachments">
                    {m.attachments.map((a, k) =>
                      a.kind === "image" ? (
                        <span key={k} className="mino-attach-chip is-image">
                          {a.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.thumb} alt="" />
                          ) : (
                            <span className="mino-attach-chip__icon">
                              <ImageIcon size={14} />
                            </span>
                          )}
                          <span className="mino-attach-chip__text">{a.name}</span>
                        </span>
                      ) : (
                        <span key={k} className="mino-attach-chip is-site">
                          <span className="mino-attach-chip__icon">
                            <GlobeIcon size={14} />
                          </span>
                          <span className="mino-attach-chip__text">{hostOf(a.url)}</span>
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
                {m.content ? <div className={`ai-chat-bubble ai-chat-bubble--${m.role}`}>{m.content}</div> : null}
                {m.role === "assistant" && m.analysis ? (
                  <MinoAnalysisResult meta={m.analysis} onOpenCatalog={openCatalogWith} onSearch={runSuggested} busy={chatBusy} />
                ) : null}
                {m.role === "assistant" && m.search?.filters && m.creators && m.creators.length === 0 ? (
                  <MinoWiderSearches
                    filters={m.analysis ? m.analysis.usedFilters : m.search.filters}
                    keyword={m.analysis ? m.analysis.analysis.keywords[0] : m.search.filters.niche ? undefined : m.search.label.split(" · ")[0] || undefined}
                    onSearch={runSuggested}
                    onOpenCatalog={openCatalogWith}
                    busy={chatBusy}
                  />
                ) : null}
                {m.role === "assistant" && m.creators?.length ? (
                  <MinoCreatorResults
                    creators={m.creators}
                    label={m.search?.label ?? ""}
                    sources={m.search?.sources ?? []}
                    onOpenCatalog={() => openCatalogWith(m.search?.filters)}
                    onOpenProfile={(c) => go({ view: "discovery", creator: c.username })}
                    onContact={(c) => (onReachOut ? onReachOut(c) : go({ view: "outreach" }))}
                    isPaid={isPaid}
                    onUpgrade={onUpgrade}
                  />
                ) : null}
                {m.role === "assistant" && m.widget?.kind === "revenue" ? (
                  <MinoRevenueWidget
                    snapshot={m.widget.snapshot}
                    go={go}
                    onAsk={(q) => void submit(q)}
                    onRefresh={() => refreshRevenue(i)}
                  />
                ) : null}
                {m.role === "assistant" && m.widget?.kind === "action" ? <MinoActionWidget action={m.widget.action} go={go} /> : null}
                {m.role === "assistant" && m.widget?.kind === "error" ? (
                  <MinoErrorWidget onRetry={() => retry(i)} busy={chatBusy} />
                ) : null}
              </div>
            ))}
            {chatBusy ? (
              busyView?.kind === "analyze" ? (
                <MinoSearchMotion
                  label={busyView.label}
                  title={fr ? "Analyse de votre marque" : "Analysing your brand"}
                  steps={
                    fr
                      ? ["Lecture de votre site et de votre photo", "Compréhension de la marque et de l’audience", "Choix des niches et des filtres", "Recherche des créateurs"]
                      : ["Reading your site and photo", "Understanding the brand and audience", "Picking niches and filters", "Searching creators"]
                  }
                />
              ) : busyView?.kind === "search" ? (
                <MinoSearchMotion label={busyView.label} />
              ) : busyView?.kind === "revenue" ? (
                <MinoRevenueLoading label={busyView.label} />
              ) : (
                <div className="mino-typing" role="status">
                  <MinoCompanion size={18} />
                  {fr ? "Mino réfléchit" : "Mino is thinking"}
                  <i />
                  <i />
                  <i />
                </div>
              )
            ) : null}
            <div ref={chatEndRef} />
          </div>
        ) : null}

        <div className={`mtg-promptbox${att.dragging ? " is-dragging" : ""}`} {...(isCreator ? {} : att.dropProps)}>
          <MinoDropHint show={att.dragging} />
          <div className="mtg-promptbox__led" aria-hidden>
            <span className="mtg-promptbox__led-spin" />
          </div>
          <div className="mtg-promptbox__glow" aria-hidden>
            <span className="mtg-promptbox__led-spin" />
          </div>
          <div className="mtg-promptbox__inner">
            {!isCreator ? <MinoAttachChips att={att} /> : null}
            {!isCreator && isPaid === false && (att.image || att.site) ? (
              <div style={{ margin: "0 0 8px" }}>
                <UpgradeNudge
                  lang={fr ? "fr" : "en"}
                  feature="mino-analysis"
                  body={fr ? "L’analyse de site et de photo est illimitée dès Growth." : "Site and photo analysis is unlimited from Growth."}
                />
              </div>
            ) : null}
            <div className="mtg-promptbox__row">
              <svg className="mtg-promptbox__search" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M16.2 16.2 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onPaste={isCreator ? undefined : att.onPaste}
                placeholder={
                  chatMode
                    ? fr
                      ? "Écrivez à Mino…"
                      : "Talk to Mino…"
                    : fr
                      ? "Demandez, construisez, créez…"
                      : "Ask, build, create…"
                }
                rows={isMobile ? 3 : 2}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void submit(prompt);
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit(prompt);
                  }
                }}
              />
            </div>
            <div className="mtg-promptbox__bar">
              {isCreator ? (
                <span className="mtg-promptbox__meta">
                  <MinoCompanion size={16} />
                  Mino
                </span>
              ) : (
                <MinoAttachButtons att={att} disabled={chatBusy} />
              )}
              <div className="mtg-promptbox__actions">
                <button
                  type="button"
                  className={`mtg-promptbox__chat${chatMode ? " is-active" : ""}`}
                  onClick={toggleChatMode}
                >
                  {chatMode ? (fr ? "Demander" : "Ask") : fr ? "Discuter" : "Chat"}
                </button>
                <button
                  type="button"
                  className="mtg-promptbox__send"
                  disabled={(!prompt.trim() && !att.image && !att.site) || chatBusy}
                  onClick={() => void submit(prompt)}
                  aria-label={fr ? "Envoyer" : "Send"}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                    <path
                      d="M12 19V5M6.5 10.5 12 5l5.5 5.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {!chatMode && status ? <p className="ai-status">{status}</p> : null}

        {!chatMode ? (
          <div className="mtg-chips">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="mtg-chip"
                onClick={() => {
                  setPrompt(s);
                  textareaRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
