import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { checkAdmin, type AdminCheck } from "@/lib/admin-auth";
import { AdminGate } from "./_components/AdminGate";
import { AdminShell } from "./_components/AdminShell";
import "./admin.css";

export const metadata: Metadata = {
  title: "Staff console · Trackit",
  robots: { index: false, follow: false },
};

// Access is decided here, on the server, before any HTML is sent: the browser
// never waits on a client-side check, so there is no blank "checking" screen.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let check: AdminCheck;
  try {
    check = await checkAdmin((await cookies()).getAll());
  } catch (e) {
    console.error("[admin] access check failed", e);
    check = { status: "unavailable" };
  }

  if (check.status !== "admin") {
    return <AdminGate status={check.status} email={check.status === "denied" ? check.email : undefined} />;
  }
  return <AdminShell me={{ email: check.admin.email, role: check.admin.role }}>{children}</AdminShell>;
}
