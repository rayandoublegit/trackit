import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "./_components/AdminShell";
import "./admin.css";

export const metadata: Metadata = {
  title: "Staff console · Trackit",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
