async function tryOg(handle: string) {
  const url = `https://www.tiktok.com/@${handle}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  console.log("status", res.status, "for", handle);
  const html = await res.text();
  const patterns = [
    /property="og:image" content="([^"]+)"/,
    /content="([^"]+)" property="og:image"/,
    /"avatarMedium":"([^"]+)"/,
    /"avatarLarger":"([^"]+)"/,
    /"avatarThumb":"([^"]+)"/,
    /https:\\u002F\\u002F[a-z0-9.-]*tiktokcdn[^"\\]*/gi,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const v = (m[1] || m[0] || "").replace(/\\u002F/g, "/").replace(/\\\//g, "/");
      console.log("match", p.toString().slice(0, 40), "→", v.slice(0, 160));
    }
  }
  console.log("html length", html.length);
}

async function main() {
  for (const h of ["charlidamelio", "dumbtv01", "khaby.lame"]) {
    await tryOg(h);
    console.log("---");
  }
}

main();
