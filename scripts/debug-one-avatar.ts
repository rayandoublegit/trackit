import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { refreshAndPersistCreatorAvatar, fetchFreshAvatarUrl, storeAvatarBuffer } from "@/lib/tiktok-avatar";
import { fetchRemoteImage } from "@/lib/fetch-remote-image";

async function main() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supa
    .from("creators_index")
    .select("username, avatar_url")
    .not("avatar_url", "is", null)
    .limit(3);

  for (const u of data ?? []) {
    console.log("\n=== @" + u.username + " ===");
    console.log("stored:", (u.avatar_url || "").slice(0, 100));

    try {
      const fresh = await fetchFreshAvatarUrl(u.username);
      console.log("fresh:", fresh ? fresh.slice(0, 120) : null);

      if (fresh) {
        const img = await fetchRemoteImage(fresh);
        console.log("download ok:", !!img, img?.contentType);
        if (img) {
          const buf = Buffer.from(await new Response(img.body).arrayBuffer());
          console.log("bytes:", buf.length);
          const permanent = await storeAvatarBuffer(supa, buf, img.contentType, u.username);
          console.log("permanent:", permanent);
          if (permanent) {
            const { error } = await supa
              .from("creators_index")
              .update({ avatar_url: permanent })
              .eq("username", u.username);
            console.log("db update error:", error?.message ?? null);
          }
        }
      }

      const result = await refreshAndPersistCreatorAvatar(supa, u.username, u.avatar_url);
      console.log("pipeline permanent:", result?.permanentUrl?.slice(0, 150) ?? null);
    } catch (e) {
      console.error("error:", e);
    }
  }
}

main();
