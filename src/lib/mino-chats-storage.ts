import { workspaceStorageKey } from "@/lib/workspaces";

export type MinoChatMessage = { role: "user" | "assistant"; content: string };

export type MinoChat = {
  id: string;
  title: string;
  messages: MinoChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export const MINO_CHATS_EVENT = "trackit:mino-chats-updated";
export const MINO_ACTIVE_EVENT = "trackit:mino-chat-active";

function listKey(userId?: string) {
  return workspaceStorageKey(`trackit.mino.chats.${userId || "anon"}`);
}

function activeKey(userId?: string) {
  return workspaceStorageKey(`trackit.mino.active.${userId || "anon"}`);
}

function newId() {
  return `mino_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromMessage(text: string, fr: boolean) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return fr ? "Nouvelle conversation" : "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

export function loadMinoChats(userId?: string): MinoChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(listKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MinoChat[];
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  } catch {
    return [];
  }
}

export function saveMinoChats(userId: string | undefined, chats: MinoChat[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(listKey(userId), JSON.stringify(chats));
    window.dispatchEvent(new CustomEvent(MINO_CHATS_EVENT));
  } catch {
    /* ignore */
  }
}

export function getActiveMinoChatId(userId?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}

export function setActiveMinoChatId(userId: string | undefined, chatId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (chatId) localStorage.setItem(activeKey(userId), chatId);
    else localStorage.removeItem(activeKey(userId));
    window.dispatchEvent(new CustomEvent(MINO_ACTIVE_EVENT, { detail: { chatId } }));
  } catch {
    /* ignore */
  }
}

export function createMinoChat(userId: string | undefined, fr: boolean, firstMessage?: string): MinoChat {
  const chat: MinoChat = {
    id: newId(),
    title: firstMessage ? titleFromMessage(firstMessage, fr) : fr ? "Nouvelle conversation" : "New chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const next = [chat, ...loadMinoChats(userId)];
  saveMinoChats(userId, next);
  setActiveMinoChatId(userId, chat.id);
  return chat;
}

export function upsertMinoChat(userId: string | undefined, chat: MinoChat) {
  const list = loadMinoChats(userId);
  const idx = list.findIndex((c) => c.id === chat.id);
  const next = idx >= 0 ? list.map((c) => (c.id === chat.id ? chat : c)) : [chat, ...list];
  saveMinoChats(userId, next.sort((a, b) => b.updatedAt - a.updatedAt));
}

export function renameMinoChat(userId: string | undefined, chatId: string, title: string) {
  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  const list = loadMinoChats(userId);
  const existing = list.find((c) => c.id === chatId);
  if (!existing) return null;
  const nextTitle = clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
  const chat: MinoChat = {
    ...existing,
    title: nextTitle,
    updatedAt: Date.now(),
  };
  upsertMinoChat(userId, chat);
  return chat;
}

export function deleteMinoChat(userId: string | undefined, chatId: string) {
  const next = loadMinoChats(userId).filter((c) => c.id !== chatId);
  saveMinoChats(userId, next);
  if (getActiveMinoChatId(userId) === chatId) {
    setActiveMinoChatId(userId, next[0]?.id || null);
  }
}
