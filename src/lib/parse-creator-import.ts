import * as XLSX from "xlsx";
import { isValidStage } from "@/lib/pipeline";

export type ParsedCreatorImportRow = {
  username: string;
  displayName: string;
  platform: string;
  followers: number;
  engagementRate: number;
  email: string | null;
  status: string;
  notes: string;
};

const HEADER_ALIASES: Record<string, string> = {
  handle: "username",
  pseudo: "username",
  creator_username: "username",
  creator: "username",
  name: "display_name",
  full_name: "display_name",
  displayname: "display_name",
  profile_url: "profile_url",
  profile: "profile_url",
  profile_link: "profile_url",
  url: "profile_url",
  email_address: "email",
  mail: "email",
  engagement: "engagement_rate",
  followers_count: "followers",
  follower_count: "followers",
  pipeline_status: "status",
  stage: "status",
  note: "notes",
};

function normalizeHeader(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[key] ?? key;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

export function parseXlsxBuffer(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[normalizeHeader(String(k))] = String(v ?? "").trim();
    }
    return out;
  });
}

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").split("/")[0].split("?")[0];
}

function usernameFromProfileUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const path = u.pathname;
    const at = path.match(/@([^/?]+)/);
    if (at) return at[1];
    const parts = path.split("/").filter(Boolean);
    if (u.hostname.includes("instagram.com") || u.hostname.includes("instagr.am")) {
      return parts[0] ? normalizeHandle(parts[0]) : null;
    }
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const handle = parts.find((p) => p.startsWith("@"));
      if (handle) return handle.slice(1);
      if (parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") return parts[1] ?? null;
      return parts[0] ? normalizeHandle(parts[0]) : null;
    }
    if (u.hostname.includes("tiktok.com")) {
      const seg = parts.find((p) => p.startsWith("@"));
      if (seg) return seg.slice(1);
      return parts[0] ? normalizeHandle(parts[0]) : null;
    }
    return parts[parts.length - 1] ? normalizeHandle(parts[parts.length - 1]) : null;
  } catch {
    return null;
  }
}

export function parseFollowersCount(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/,/g, "").replace(/\s/g, "");
  if (!s) return 0;
  const m = s.match(/^([\d.]+)([km])?$/);
  if (!m) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1_000;
  if (m[2] === "m") n *= 1_000_000;
  return Math.round(n);
}

function parseEngagement(raw: string): number {
  const s = raw.trim().replace("%", "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function detectPlatform(row: Record<string, string>, profileUrl: string): string {
  const explicit = (row.platform ?? "").toLowerCase();
  if (explicit.includes("insta")) return "instagram";
  if (explicit.includes("you")) return "youtube";
  if (explicit.includes("tik")) return "tiktok";
  const url = profileUrl.toLowerCase();
  if (url.includes("instagram")) return "instagram";
  if (url.includes("youtube") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok")) return "tiktok";
  return "tiktok";
}

function resolveUsername(row: Record<string, string>): string | null {
  const direct = row.username || row.handle;
  if (direct) return normalizeHandle(direct);

  const profileUrl = row.profile_url ?? "";
  const fromUrl = profileUrl ? usernameFromProfileUrl(profileUrl) : null;
  if (fromUrl) return fromUrl;

  const email = row.email?.trim();
  if (email && email.includes("@")) {
    const local = email.split("@")[0].replace(/[^a-zA-Z0-9._]/g, "");
    if (local.length >= 2) return local;
  }

  return null;
}

export function mapImportRows(rawRows: Record<string, string>[]): ParsedCreatorImportRow[] {
  const out: ParsedCreatorImportRow[] = [];
  const seen = new Set<string>();

  for (const row of rawRows) {
    const username = resolveUsername(row);
    if (!username || seen.has(username.toLowerCase())) continue;
    seen.add(username.toLowerCase());

    const profileUrl = row.profile_url ?? "";
    const displayName = row.display_name?.trim() || username;
    const platform = detectPlatform(row, profileUrl);
    const followers = parseFollowersCount(row.followers ?? "");
    const engagementRate = parseEngagement(row.engagement_rate ?? "");
    const email = row.email?.trim() || null;
    const rawStatus = (row.status ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    const status = isValidStage(rawStatus) ? rawStatus : "saved";
    const notes = row.notes?.trim() ?? "";

    out.push({
      username,
      displayName,
      platform,
      followers,
      engagementRate,
      email,
      status,
      notes,
    });
  }

  return out;
}

export async function parseCreatorImportFile(file: File): Promise<ParsedCreatorImportRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    return mapImportRows(parseCsvText(text));
  }
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return mapImportRows(parseXlsxBuffer(buffer));
  }
  return [];
}
