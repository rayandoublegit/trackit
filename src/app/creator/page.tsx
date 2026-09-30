"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLocaleHref } from "@/lib/useLang";

export default function CreatorSpace() {
  const router = useRouter();
  const href = useLocaleHref();

  useEffect(() => {
    if (!supabase) {
      router.replace(href("/auth"));
      return;
    }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace(href("/auth"));
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile || profile.account_type !== "creator") {
        router.replace(href("/dashboard"));
        return;
      }
      router.replace(href("/dashboard?view=analytics"));
    })();
  }, [router, href]);

  return <div style={{ minHeight: "100vh", background: "#FAFAFA" }} />;
}
