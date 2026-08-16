"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { getCampaigns } from "@/lib/db";
import { addMeetingForUser, addTaskForUser } from "@/lib/assistant-actions";
import { isDashboardView, type DashboardView } from "@/lib/dashboard-view-storage";
import {
  createMinoChat,
  getActiveMinoChatId,
  loadMinoChats,
  MINO_ACTIVE_EVENT,
  MINO_CHATS_EVENT,
  setActiveMinoChatId,
  titleFromMessage,
  upsertMinoChat,
  type MinoChat,
  type MinoChatMessage,
} from "@/lib/mino-chats-storage";
import { MinoCompanion } from "@/components/MinoCompanion";
import { useDashboardNavigationOptional } from "./DashboardNavigationProvider";

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
  displayName,
  userId,
}: {
  isMobile?: boolean;
  onNavigate: (view: DashboardView) => void;
  displayName?: string | null;
  userId?: string;
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
  const [chats, setChats] = useState<MinoChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const firstName =
    (displayName || "").trim().split(/\s+/)[0] ||
    (fr ? "toi" : "there");

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
      setChatMode(true);
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
    if (!userId) {
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
  }, [userId]);

  const suggestions = useMemo(() => {
    const firstCampaign = campaignNames[0];
    const chips: string[] = [];

    if (fr) {
      chips.push("Ajoute un rendez-vous demain à 14:00");
      chips.push("Paye un créateur");
      chips.push("Crée une tâche : relancer les créateurs");
      if (firstCampaign) chips.push(`Ouvre la campagne « ${firstCampaign} »`);
      else chips.push("Crée une nouvelle campagne");
      chips.push("Ouvre Inbox");
    } else {
      chips.push("Add a meeting tomorrow at 2pm");
      chips.push("Pay a creator");
      chips.push("Create a task: follow up with creators");
      if (firstCampaign) chips.push(`Open campaign “${firstCampaign}”`);
      else chips.push("Create a new campaign");
      chips.push("Open Inbox");
    }

    return chips.slice(0, 5);
  }, [fr, campaignNames]);

  useEffect(() => {
    if (!chatMode) return;
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
    setChatMode(true);
    setStatus("");
    setDropdownOpen(false);
    textareaRef.current?.focus();
  };

  const startNewChat = () => {
    const chat = createMinoChat(userId, fr);
    setActiveChatId(chat.id);
    setMessages([]);
    setChats(loadMinoChats(userId));
    setChatMode(true);
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

  const runCommand = (cmd: AiCommand, text: string, creators: PayableCreator[]) => {
    const askMore = (question: string) => {
      setPendingContext((prev) => `${prev ? `${prev}\n` : ""}User: ${text}\nAssistant: ${question}`);
      setStatus(question);
    };

    switch (cmd.action) {
      case "clarify":
        askMore(cmd.question);
        return;

      case "create_meeting": {
        addMeetingForUser(userId, {
          title: cmd.title,
          when: cmd.when,
          withWho: cmd.withWho,
          notes: text,
        });
        setPendingContext(null);
        setStatus(
          cmd.say ||
            (fr
              ? `C'est noté — « ${cmd.title} » ajouté ${formatWhen(cmd.when, true)}.`
              : `Done — “${cmd.title}” added ${formatWhen(cmd.when, false)}.`),
        );
        window.setTimeout(() => onNavigate("planner"), 700);
        return;
      }

      case "create_task": {
        addTaskForUser(userId, cmd.title, cmd.due);
        setPendingContext(null);
        setStatus(cmd.say || (fr ? `Tâche ajoutée : ${cmd.title}.` : `Task added: ${cmd.title}.`));
        window.setTimeout(() => onNavigate("tasks"), 700);
        return;
      }

      case "pay_creator": {
        const found = matchCreator(creators, cmd.creator);
        if (!found) {
          const names = creators
            .slice(0, 4)
            .map((c) => c.name || c.handle)
            .filter(Boolean)
            .join(", ");
          askMore(
            fr
              ? `Je ne trouve pas « ${cmd.creator} ». ${names ? `Tu veux dire : ${names} ?` : "Quel créateur veux-tu payer ?"}`
              : `I can't find “${cmd.creator}”. ${names ? `Did you mean: ${names}?` : "Which creator should I pay?"}`,
          );
          return;
        }
        setPendingContext(null);
        const label = found.name || found.handle;
        setStatus(
          cmd.say ||
            (fr ? `J'ouvre le paiement de ${label}.` : `Opening the payment for ${label}.`),
        );
        window.setTimeout(() => {
          if (dashNav) dashNav.navigate({ view: "payouts", payout: { type: "creator", id: found.id } });
          else onNavigate("payouts");
        }, 700);
        return;
      }

      case "create_campaign":
        setPendingContext(null);
        setStatus(cmd.say || (fr ? "J'ouvre la création de campagne." : "Opening campaign creation."));
        window.setTimeout(() => {
          if (dashNav) dashNav.navigate({ view: "campaigns", campaign: { type: "new" } });
          else onNavigate("campaigns");
        }, 700);
        return;

      case "navigate":
        setPendingContext(null);
        setStatus(cmd.say || (fr ? "J'ouvre ça." : "Opening it."));
        if (isDashboardView(cmd.view)) {
          const view = cmd.view as DashboardView;
          window.setTimeout(() => onNavigate(view), 550);
        }
        return;

      case "chat":
        setPendingContext(null);
        setStatus(cmd.reply);
        return;
    }
  };

  const executeAsk = async (text: string) => {
    setPrompt("");
    setChatBusy(true);
    setStatus(fr ? "Mino s'en occupe…" : "Mino is on it…");
    try {
      const creators = await ensureCreators();
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
          creators: creators.map((c) => c.name || c.handle).filter(Boolean),
          campaigns: campaignNames,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; command?: AiCommand };
      if (!res.ok || !data.ok || !data.command) throw new Error("bad response");
      runCommand(data.command, text, creators);
    } catch {
      setStatus(
        fr
          ? "Petit souci de mon côté — réessaie dans un instant."
          : "Small hiccup on my side — try again in a moment.",
      );
    } finally {
      setChatBusy(false);
    }
  };

  const submit = async (raw: string) => {
    const text = raw.trim();
    if (!text || chatBusy) return;

    if (!chatMode) {
      await executeAsk(text);
      return;
    }

    let chatId = activeChatId;
    if (!chatId) {
      const created = createMinoChat(userId, fr, text);
      chatId = created.id;
      setActiveChatId(chatId);
      setChats(loadMinoChats(userId));
    }

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    persistMessages(chatId, nextMessages, text);
    setPrompt("");
    setChatBusy(true);
    setStatus("");

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, lang: fr ? "fr" : "en" }),
      });
      const data = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
      const reply =
        res.ok && data.reply
          ? data.reply
          : fr
            ? "Petit souci côté IA. Réessaie dans un instant."
            : "AI hiccup. Try again in a moment.";
      const withReply = [...nextMessages, { role: "assistant" as const, content: reply }];
      setMessages(withReply);
      persistMessages(chatId, withReply, text);
    } catch {
      const withReply = [
        ...nextMessages,
        {
          role: "assistant" as const,
          content: fr ? "Erreur réseau. Réessaie." : "Network error. Try again.",
        },
      ];
      setMessages(withReply);
      persistMessages(chatId, withReply, text);
    } finally {
      setChatBusy(false);
    }
  };

  const dropdownLabel = activeChat?.title || "Ask, Build, Create";

  return (
    <div className={`ai-page${isMobile ? " is-mobile" : ""}${chatMode ? " is-chat" : ""}`}>
      <div className="ai-hero">
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
                    {c.title}
                  </button>
                ))
              )}
            </div>
          ) : null}
          {chatMode ? (
            <p className="ai-chat-head__sub">
              <MinoCompanion size={16} motion="soft" />
              {fr ? "Chat avec Mino" : "Chat with Mino"}
            </p>
          ) : null}
        </div>

        {!chatMode ? (
          <>
            <div className="ai-hero__mino">
              <MinoCompanion size={52} />
            </div>
            <h1 className="ai-hero__title">
              {fr
                ? `Que veux-tu demander à Mino aujourd’hui, ${firstName} ?`
                : `What do you want to ask Mino today, ${firstName}?`}
            </h1>
          </>
        ) : null}

        {chatMode && messages.length > 0 ? (
          <div className="ai-chat-thread" aria-live="polite">
            {messages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={`ai-chat-bubble ai-chat-bubble--${m.role}`}>
                {m.content}
              </div>
            ))}
            {chatBusy ? (
              <div className="ai-chat-bubble ai-chat-bubble--assistant is-typing">
                {fr ? "Réflexion…" : "Thinking…"}
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
        ) : null}

        <div className="mtg-promptbox">
          <div className="mtg-promptbox__led" aria-hidden>
            <span className="mtg-promptbox__led-spin" />
          </div>
          <div className="mtg-promptbox__glow" aria-hidden>
            <span className="mtg-promptbox__led-spin" />
          </div>
          <div className="mtg-promptbox__inner">
            <div className="mtg-promptbox__row">
              <svg className="mtg-promptbox__search" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M16.2 16.2 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  chatMode
                    ? fr
                      ? "Écris à Mino…"
                      : "Talk to Mino…"
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
              <span className="mtg-promptbox__meta">
                {fr ? "Propulsé par" : "Powered by"}
                <img src="/claude-logo.svg" alt="Claude" className="mtg-promptbox__claude" width={16} height={16} />
              </span>
              <div className="mtg-promptbox__actions">
                <button
                  type="button"
                  className={`mtg-promptbox__chat${chatMode ? " is-active" : ""}`}
                  onClick={toggleChatMode}
                >
                  {chatMode ? "Ask" : "Chat"}
                </button>
                <button
                  type="button"
                  className="mtg-promptbox__send"
                  disabled={!prompt.trim() || chatBusy}
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
