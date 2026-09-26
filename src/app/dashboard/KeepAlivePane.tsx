"use client";

import type { ReactNode } from "react";

/** Keeps mounted views in the tree so navigating back is instant (no remount/refetch). */
export function KeepAlivePane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className={active ? "ws-keepalive" : undefined} hidden={!active} aria-hidden={!active}>
      {children}
    </div>
  );
}
