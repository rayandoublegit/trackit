import type { FeedCreator } from "@/lib/discovery-feed";
import { workspaceStorageKey } from "@/lib/workspaces";

export type MinoSearchMeta = { label: string; sources: string[] };

export type MinoChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Creators found by a Mino search, rendered as cards under the reply. */
  creators?: FeedCreator[];
  search?: MinoSearchMeta;
};

export type MinoChat = {
  id: string;
  title: string;
  messages: MinoChatMessage[];
  createdAt: number;
  updatedAt: number;
  folderId?: string | null;
};

export type MinoFolder = {
  id: string;
  name: string;
  createdAt: number;
};

export const MINO_CHATS_EVENT = "trackit:mino-chats-updated";
export const MINO_ACTIVE_EVENT = "trackit:mino-chat-active";
export const MINO_PENDING_EVENT = "trackit:mino-pending";

function listKey(userId?: string) {
  return workspaceStorageKey(`trackit.mino.chats.${userId || "anon"}`);
}

function activeKey(userId?: string) {
  return workspaceStorageKey(`trackit.mino.active.${userId || "anon"}`);
}

function foldersKey(userId?: string) {
  return workspaceStorageKey(`trackit.mino.folders.${userId || "anon"}`);
}

function pendingKey(userId?: string) {
  return workspaceStorageKey(`trackit.mino.pending.${userId || "anon"}`);
}

/** A prompt typed on Home, sent by the chat view as soon as it opens. */
export function setPendingMinoPrompt(userId: string | undefined, text: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(pendingKey(userId), text);
  } catch {
    // storage blocked: the chat opens empty
  }
  window.dispatchEvent(new Event(MINO_PENDING_EVENT));
}

export function takePendingMinoPrompt(userId: string | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = pendingKey(userId);
    const text = sessionStorage.getItem(key);
    if (text) sessionStorage.removeItem(key);
    return text;
  } catch {
    return null;
  }
}

function newId() {
  return `mino_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromMessage(text: string, fr: boolean) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return fr ? "Nouvelle conversation" : "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

/** A stored default title follows the current language ("New chat" ⇄ "Nouvelle conversation"). */
export function displayMinoChatTitle(title: string, fr: boolean) {
  if (title === "New chat" || title === "Nouvelle conversation") return fr ? "Nouvelle conversation" : "New chat";
  return title;
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

export function loadMinoFolders(userId?: string): MinoFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(foldersKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MinoFolder[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => a.createdAt - b.createdAt) : [];
  } catch {
    return [];
  }
}

function saveMinoFolders(userId: string | undefined, folders: MinoFolder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(foldersKey(userId), JSON.stringify(folders));
    window.dispatchEvent(new CustomEvent(MINO_CHATS_EVENT));
  } catch {
    /* ignore */
  }
}

export function createMinoFolder(userId: string | undefined, name: string): MinoFolder | null {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  const folder: MinoFolder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: clean.length > 40 ? `${clean.slice(0, 40)}…` : clean,
    createdAt: Date.now(),
  };
  saveMinoFolders(userId, [...loadMinoFolders(userId), folder]);
  return folder;
}

export function moveMinoChatToFolder(userId: string | undefined, chatId: string, folderId: string | null) {
  const existing = loadMinoChats(userId).find((chat) => chat.id === chatId);
  if (!existing) return;
  upsertMinoChat(userId, { ...existing, folderId: folderId || null });
}
