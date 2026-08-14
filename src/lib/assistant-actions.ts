/**
 * Client-side executors for Mino assistant commands. They write to the same
 * per-workspace storage as MeetingsView / TasksView and dispatch events so
 * mounted (keep-alive) views refresh instantly.
 */

import { workspaceStorageKey } from "@/lib/workspaces";

export const MEETINGS_UPDATED_EVENT = "trackit:meetings-updated";
export const TASKS_UPDATED_EVENT = "trackit:tasks-updated";

export type StoredMeeting = {
  id: string;
  title: string;
  when: string;
  withWho: string;
  notes: string;
};

type StoredTask = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  due?: string;
  color: number;
};

function meetingsKey(userId?: string) {
  return workspaceStorageKey(`trackit.planner.calls.${userId || "anon"}`);
}

function tasksKey(userId?: string) {
  return workspaceStorageKey(`trackit.home.tasks.${userId || "anon"}`);
}

function readJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function addMeetingForUser(
  userId: string | undefined,
  meeting: Omit<StoredMeeting, "id">,
): StoredMeeting {
  const key = meetingsKey(userId);
  const item: StoredMeeting = { id: `${Date.now()}`, ...meeting };
  writeJson(key, [item, ...readJson<StoredMeeting>(key)]);
  window.dispatchEvent(new Event(MEETINGS_UPDATED_EVENT));
  return item;
}

export function addTaskForUser(
  userId: string | undefined,
  title: string,
  due = "",
): StoredTask {
  const key = tasksKey(userId);
  const existing = readJson<StoredTask>(key);
  const item: StoredTask = {
    id: `${Date.now()}`,
    title: title.trim(),
    done: false,
    createdAt: Date.now(),
    due,
    color: existing.length % 8,
  };
  writeJson(key, [item, ...existing]);
  window.dispatchEvent(new Event(TASKS_UPDATED_EVENT));
  return item;
}
