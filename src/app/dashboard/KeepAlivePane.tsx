"use client";

import type { ReactNode } from "react";

/** Keeps mounted views in the tree so navigating back is instant (no remount/refetch). */
export function KeepAlivePane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      hidden={!active}
      aria-hidden={!active}
      style={active ? { display: "contents" } : { display: "none" }}
    >
      {children}
    </div>
  );
}
