import { config } from "dotenv";
config({ path: ".env.local" });
import { fetchTikTokProfileRaw } from "@/lib/scrapecreators";
import { pickTikTokAvatarUrl } from "@/lib/tiktok-avatar";

async function main() {
  const handle = process.argv[2] || "charlidamelio";
  console.log("scraping @" + handle);
  try {
    const raw = await fetchTikTokProfileRaw(handle);
    console.log("keys:", Object.keys(raw || {}));
    console.log("user keys:", Object.keys(raw?.user || raw?.userInfo || {}));
    const avatar = pickTikTokAvatarUrl(raw);
    console.log("picked avatar:", avatar?.slice(0, 200) ?? null);
    console.log("raw sample:", JSON.stringify(raw).slice(0, 800));
  } catch (e) {
    console.error("scrape error:", e);
  }
}

main();
