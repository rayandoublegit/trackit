import { workspaceStorageKey } from "@/lib/workspaces";

export const HIDDEN_CREATORS_EVENT = "trackit:hidden-creators-updated";

function storageKey() {
  return workspaceStorageKey("trackit.hidden-creators");
}

function readList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || "").replace(/^@/, "").toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeList(list: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify([...new Set(list)]));
    window.dispatchEvent(new Event(HIDDEN_CREATORS_EVENT));
  } catch {
    /* ignore */
  }
}

export function loadHiddenCreators(): Set<string> {
  return new Set(readList());
}

export function isCreatorHidden(username: string): boolean {
  const handle = username.replace(/^@/, "").toLowerCase();
  return loadHiddenCreators().has(handle);
}

export function hideCreator(username: string) {
  const handle = username.replace(/^@/, "").toLowerCase();
  if (!handle) return;
  const next = readList();
  if (!next.includes(handle)) next.push(handle);
  writeList(next);
}

export function unhideCreator(username: string) {
  const handle = username.replace(/^@/, "").toLowerCase();
  writeList(readList().filter((x) => x !== handle));
}
