"use client";

import { useEffect } from "react";
import { applyDashboardTheme, getDashboardTheme } from "@/lib/dashboard-theme";
import { DEFAULT_TITLE } from "@/lib/site-seo";
import { applyDashboardTabTitle, readCachedDashboardTabTitle } from "@/lib/workspaces";
import "./dashboard.css";

/**
 * Runs before hydration: if a workspace switch is in flight, re-create the
 * same veil (avatar + name) so the transition looks seamless across the
 * reload. WorkspaceSwitcher fades it out once the dashboard has mounted;
 * the 4s timeout is a failsafe so it can never get stuck.
 */
/** Pose data-dashboard-theme avant l'hydratation : pas de flash ni de mismatch. */
const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("trackit_dashboard_theme");t=t==="dark"?"dark":"light";document.documentElement.setAttribute("data-dashboard-theme",t);if(document.body)document.body.setAttribute("data-dashboard-theme",t);var n=sessionStorage.getItem("trackit_dashboard_tab_title");document.title=n&&n.trim()?n.trim():"Dashboard";}catch(e){}})();`;

const WS_SWITCH_BOOT_SCRIPT = `(function(){try{var raw=sessionStorage.getItem("trackit_ws_switch_v1");if(!raw)return;var f=JSON.parse(raw);if(!f||!f.at||Date.now()-f.at>15000)return;if(document.getElementById("ws-switch-boot-overlay"))return;var d=document.createElement("div");d.id="ws-switch-boot-overlay";d.style.cssText="position:fixed;inset:0;z-index:120;background:rgba(8,8,12,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;";var i=document.createElement("div");i.style.cssText="display:flex;flex-direction:column;align-items:center;gap:14px;";var m;if(f.avatarUrl){m=document.createElement("img");m.src=f.avatarUrl;m.alt="";m.style.cssText="width:64px;height:64px;border-radius:18px;object-fit:cover;box-shadow:0 18px 48px rgba(0,0,0,0.5);"}else{m=document.createElement("div");m.textContent=String(f.name||"W").slice(0,1).toUpperCase();m.style.cssText="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#0d9488,#0047ff);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;box-shadow:0 18px 48px rgba(0,71,255,0.35);"}var n=document.createElement("div");n.textContent=f.name||"";n.style.cssText="color:#f5f5f7;font-size:16px;font-weight:650;letter-spacing:-0.02em;";i.appendChild(m);i.appendChild(n);d.appendChild(i);(document.body||document.documentElement).appendChild(d);setTimeout(function(){var e=document.getElementById("ws-switch-boot-overlay");if(e&&!e.dataset.leaving){e.dataset.leaving="1";e.style.transition="opacity .35s ease";e.style.opacity="0";setTimeout(function(){e.remove()},420);}},4000);}catch(e){}})();`;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("dashboard-page");
    applyDashboardTheme(getDashboardTheme());
    applyDashboardTabTitle(readCachedDashboardTabTitle());
    return () => {
      document.body.classList.remove("dashboard-page");
      document.title = DEFAULT_TITLE;
    };
  }, []);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: WS_SWITCH_BOOT_SCRIPT }} />
      {children}
    </>
  );
}
