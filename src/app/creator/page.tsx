"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CreatorSpace() {
  const router = useRouter();

  useEffect(() => {
    if (!supabase) {
      router.replace("/auth");
      return;
    }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile || profile.account_type !== "creator") {
        router.replace("/dashboard");
        return;
      }
      router.replace("/dashboard?view=analytics");
    })();
  }, [router]);

  return <div style={{ minHeight: "100vh", background: "#FAFAFA" }} />;
}
