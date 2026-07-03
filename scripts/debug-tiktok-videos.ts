async function main() {
  const handle = process.argv[2] || "charlidamelio";
  const res = await fetch(`https://www.tiktok.com/@${handle}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html",
    },
  });
  console.log("status", res.status);
  const html = await res.text();

  // Try common embedded JSON patterns for video covers
  const patterns = [
    /"cover"\s*:\s*"([^"]*tiktokcdn[^"]+)"/gi,
    /"originCover"\s*:\s*"([^"]+)"/gi,
    /"dynamicCover"\s*:\s*"([^"]+)"/gi,
    /"video"\s*:\s*\{[^}]{0,200}"cover"\s*:\s*"([^"]+)"/gi,
  ];

  const found = new Set<string>();
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(html)) && found.size < 10) {
      const url = m[1]
        .replace(/\\u002F/gi, "/")
        .replace(/\\\//g, "/")
        .replace(/\\u0026/gi, "&");
      if (url.startsWith("http")) found.add(url);
    }
  }
  console.log("covers found:", found.size);
  for (const u of [...found].slice(0, 5)) {
    console.log(u.slice(0, 140));
    const img = await fetch(u, {
      headers: {
        Referer: "https://www.tiktok.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    console.log("  ->", img.status, img.headers.get("content-type"), (await img.arrayBuffer()).byteLength);
  }
}

main();
