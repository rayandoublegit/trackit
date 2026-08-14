/**
 * Workspace switch transition, shared by every entry point (topbar switcher,
 * sidebar Spaces hover card, workspace info view, creation flows).
 *
 * The veil is plain DOM (not React state) on purpose: it must survive the
 * page reload boundary and StrictMode double-mounts without ever getting
 * stuck. A sessionStorage flag lets the next page load re-show the same veil
 * before hydration (see the boot script in dashboard/layout.tsx).
 */

import { rememberClientBrandSpace } from "@/lib/brand-workspace";
import { setWorkspaceClientIdentity } from "@/lib/supabase";

export const WORKSPACE_SWITCH_FLAG_KEY = "trackit_ws_switch_v1";
export const WORKSPACE_SWITCH_VEIL_ID = "ws-switch-boot-overlay";

export type WorkspaceSwitchFlag = {
  name: string;
  avatarUrl: string | null;
  at: number;
};

export function writeWorkspaceSwitchFlag(flag: WorkspaceSwitchFlag): void {
  try {
    sessionStorage.setItem(WORKSPACE_SWITCH_FLAG_KEY, JSON.stringify(flag));
  } catch {
    /* ignore */
  }
}

export function consumeWorkspaceSwitchFlag(): WorkspaceSwitchFlag | null {
  try {
    const raw = sessionStorage.getItem(WORKSPACE_SWITCH_FLAG_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(WORKSPACE_SWITCH_FLAG_KEY);
    const parsed = JSON.parse(raw) as WorkspaceSwitchFlag | null;
    if (!parsed?.at || Date.now() - parsed.at > 15_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildVeil(flag: WorkspaceSwitchFlag): HTMLElement {
  const veil = document.createElement("div");
  veil.id = WORKSPACE_SWITCH_VEIL_ID;
  veil.style.cssText =
    "position:fixed;inset:0;z-index:120;background:rgba(8,8,12,0.92);" +
    "backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);" +
    "display:flex;align-items:center;justify-content:center;" +
    "opacity:0;transition:opacity .18s ease;";

  const inner = document.createElement("div");
  inner.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:14px;" +
    "opacity:0;transform:translateY(10px) scale(.96);" +
    "transition:opacity .3s ease,transform .3s cubic-bezier(.2,.9,.3,1.1);";

  let mark: HTMLElement;
  if (flag.avatarUrl) {
    const img = document.createElement("img");
    img.src = flag.avatarUrl;
    img.alt = "";
    img.style.cssText =
      "width:64px;height:64px;border-radius:18px;object-fit:cover;" +
      "box-shadow:0 18px 48px rgba(0,0,0,0.5);";
    mark = img;
  } else {
    mark = document.createElement("div");
    mark.textContent = String(flag.name || "W").slice(0, 1).toUpperCase();
    mark.style.cssText =
      "width:64px;height:64px;border-radius:18px;" +
      "background:linear-gradient(135deg,#0d9488,#0047ff);color:#fff;" +
      "display:flex;align-items:center;justify-content:center;" +
      "font-size:26px;font-weight:700;box-shadow:0 18px 48px rgba(0,71,255,0.35);";
  }

  const label = document.createElement("div");
  label.textContent = flag.name || "";
  label.style.cssText =
    "color:#f5f5f7;font-size:16px;font-weight:650;letter-spacing:-0.02em;font-family:inherit;";

  inner.appendChild(mark);
  inner.appendChild(label);
  veil.appendChild(inner);

  requestAnimationFrame(() => {
    veil.style.opacity = "1";
    inner.style.opacity = "1";
    inner.style.transform = "translateY(0) scale(1)";
  });

  return veil;
}

export function showWorkspaceSwitchVeil(flag: WorkspaceSwitchFlag): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(WORKSPACE_SWITCH_VEIL_ID)) return;
  (document.body || document.documentElement).appendChild(buildVeil(flag));
}

/** Fade out and remove the veil (pre-hydration or React-triggered), if any. */
export function dismissWorkspaceSwitchVeil(holdMs = 600): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(WORKSPACE_SWITCH_VEIL_ID);
  if (!el || el.dataset.leaving === "1") return;
  el.dataset.leaving = "1";
  window.setTimeout(() => {
    el.style.transition = "opacity .35s ease";
    el.style.opacity = "0";
    window.setTimeout(() => el.remove(), 420);
  }, holdMs);
}

export type BeginWorkspaceSwitchOptions = {
  workspaceId: string;
  ownerId: string;
  actorId?: string;
  name: string;
  avatarUrl?: string | null;
  /** Skip the background activate POST (e.g. server already set it). */
  skipActivate?: boolean;
};

/**
 * Optimistic switch: API requests read the workspace id from local identity
 * (x-trackit-workspace-id header) which wins server-side, so we can reload
 * immediately and persist the preference in the background.
 */
export function beginWorkspaceSwitch(opts: BeginWorkspaceSwitchOptions): void {
  if (typeof window === "undefined") return;

  rememberClientBrandSpace(opts.workspaceId);
  setWorkspaceClientIdentity(opts.actorId || opts.ownerId, opts.ownerId, opts.workspaceId);

  const flag: WorkspaceSwitchFlag = {
    name: opts.name || "",
    avatarUrl: opts.avatarUrl ?? null,
    at: Date.now(),
  };
  writeWorkspaceSwitchFlag(flag);
  showWorkspaceSwitchVeil(flag);

  if (!opts.skipActivate) {
    // keepalive lets the request survive the reload.
    void fetch(`/api/workspaces/${opts.workspaceId}`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    }).catch(() => {});
  }

  window.location.reload();
}
