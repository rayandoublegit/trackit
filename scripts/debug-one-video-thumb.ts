import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { refreshAndPersistCreatorVideoThumbs } from "@/lib/tiktok-video-thumbs";

async function main() {
  const username = process.argv[2] || "dumbtv01";
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: before } = await supa
    .from("creators_index")
    .select("username, top_videos")
    .eq("username", username)
    .maybeSingle();

  console.log("before covers:", (before?.top_videos as { cover?: string }[] | null)?.slice(0, 3).map((v) => v.cover?.slice(0, 80)));

  const result = await refreshAndPersistCreatorVideoThumbs(
    supa,
    username,
    (before?.top_videos as never) ?? null
  );

  console.log("thumbs:", result?.thumbs.map((t) => ({ views: t.views, thumb: t.thumbnail.slice(0, 100) })));
}

main();
