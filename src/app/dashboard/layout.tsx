"use client";

import { useEffect } from "react";
import "./dashboard.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("dashboard-page");
    return () => document.body.classList.remove("dashboard-page");
  }, []);

  return children;
}
