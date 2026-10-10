// URL checks for Mino's website analysis: only public http(s) pages, never an
// address inside our own network (SSRF). Pure and browser-safe; the server
// also checks every address the host name resolves to (lib/mino-site-fetch).

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".localdomain"];

// Social and video platforms are creator links, not a brand's site.
const SOCIAL_HOSTS = [
  "tiktok.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "x.com",
  "twitter.com",
  "threads.net",
  "pinterest.com",
  "snapchat.com",
  "linkedin.com",
];

function ipv4Parts(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split(".").map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && parts[2] === 2) || // documentation
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 address to 8 groups, or null when it is not one. */
function ipv6Groups(raw: string): number[] | null {
  let host = raw.replace(/^\[|\]$/g, "").toLowerCase();
  const zone = host.indexOf("%");
  if (zone >= 0) host = host.slice(0, zone);
  if (!host.includes(":")) return null;
  // Trailing dotted IPv4 (::ffff:10.0.0.1)
  const v4 = host.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const p = ipv4Parts(v4[1]);
    if (!p) return null;
    host = host.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** True for loopback, private, link-local, multicast and other non-public addresses (v4 or v6). */
export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) return isPrivateIpv4(v4);
  const g = ipv6Groups(ip);
  if (!g) return true; // not an address we understand: refuse
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isPrivateIpv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateIpv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: "invalid" | "protocol" | "credentials" | "port" | "private" | "social" };

/**
 * Checks a URL before the server fetches it: http/https on the default ports,
 * no credentials, a real public host name or public IP.
 */
export function checkPublicUrl(raw: string, opts: { allowSocial?: boolean } = {}): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "port" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "invalid" };
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "private" };
  const isIp = ipv4Parts(host) !== null || host.startsWith("[") || host.includes(":");
  if (isIp) {
    if (isPrivateIp(host)) return { ok: false, reason: "private" };
  } else {
    // Bare numbers (http://2130706433) and single labels (http://intranet) never reach a public site.
    if (/^[0-9.]+$/.test(host) || /^0x/i.test(host)) return { ok: false, reason: "private" };
    if (!host.includes(".")) return { ok: false, reason: "private" };
  }
  if (!opts.allowSocial && SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))) return { ok: false, reason: "social" };
  return { ok: true, url };
}

const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9][a-z0-9-]{0,62})*\.[a-z]{2,24}(?::\d{2,5})?(?:\/[^\s<>"'«»]*)?)/gi;
// Words that look like domains but are not ("e.g", "file.png" handled by TLD list below).
const NOT_TLD = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic", "pdf", "txt", "js", "ts", "tsx", "css", "json", "csv", "mp4", "mov", "zip"]);

/** The first website link in a message ("monsite.fr", "https://shop.com/p/1"), social links left out. */
export function findSiteUrl(text: string): string | null {
  for (const m of text.matchAll(URL_RE)) {
    let candidate = m[1].replace(/[),.;:!?]+$/, "");
    // An email address is not a site.
    const before = text[(m.index ?? 0) - 1];
    if (before === "@") continue;
    const tld = candidate.replace(/^https?:\/\//i, "").split(/[/:?#]/)[0].split(".").pop()?.toLowerCase() || "";
    if (NOT_TLD.has(tld)) continue;
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    const check = checkPublicUrl(candidate);
    if (check.ok) return check.url.toString();
  }
  return null;
}
