// Server-side helpers for automatic email outreach: access checks, creator facts
// from stored data, Claude generation with the number guard, audience lookup and
// the outreach_history mirror. Used by /api/mailboxes*, /api/outreach/sequences*
// and the two crons.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { requireBrandSpace } from "@/lib/brand-workspace-server";
import { emailFromRow } from "@/lib/creator-crm";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import { fetchLinkedCreatorEmailsByHandle } from "@/lib/linked-creator-emails";
import { isValidEmailAddress, normalizeOutreachEmail } from "@/lib/outreach-email";
import type { SequenceLang, SequenceTone } from "@/lib/outreach-sequences";
import {
  buildFirstEmailPrompt,
  buildFollowUpPrompt,
  fallbackFollowUp,
  findUnsupportedNumbers,
  FIRST_EMAIL_SCHEMA,
  FOLLOW_UP_SCHEMA,
  numberSourcesFor,
  parseEmailJson,
  resolveEmailLanguage,
  type CreatorFacts,
} from "@/lib/outreach-sequences-prompt";
import { canUseAIOutreach, normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isMissingWorkspaceIdError } from "@/lib/workspace-db";

/** Latest Sonnet: fast and good at short, specific writing. */
export const SEQUENCE_MODEL = "claude-sonnet-5-5";

// ── Access ─────────────────────────────────────────────────────────────────────

export type OutreachAccess = { ownerId: string; spaceId: string; admin: SupabaseClient; plan: PlanTier };

export async function planForOwner(admin: SupabaseClient, ownerId: string): Promise<PlanTier> {
  if (DEV_BYPASS_PLAN) return normalizePlan(DEV_BYPASS_PLAN);
  const { data } = await admin.from("profiles").select("plan").eq("id", ownerId).maybeSingle();
  return normalizePlan(data?.plan);
}

/** Signed-in brand on a plan with AI outreach (Pro / Scale). */
export async function requireOutreachAccess(
  request: NextRequest,
): Promise<OutreachAccess | { error: NextResponse }> {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access;
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 }) };
  const plan = await planForOwner(admin, access.ownerId);
  if (!canUseAIOutreach(plan)) {
    return { error: NextResponse.json({ ok: false, error: "plan_required" }, { status: 403 }) };
  }
  return { ownerId: access.ownerId, spaceId: access.spaceId, admin, plan };
}

/** Inserts with workspace_id, retrying without it when the space row/column is missing. */
export async function insertScoped<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  table: string,
  row: T & { workspace_id?: string | null },
) {
  let res = await admin.from(table).insert(row).select().single();
  if (res.error && (res.error.code === "23503" || isMissingWorkspaceIdError(res.error)) && row.workspace_id) {
    const { workspace_id: _ignored, ...rest } = row;
    void _ignored;
    res = await admin.from(table).insert(rest as Record<string, unknown>).select().single();
  }
  return res;
}

/** Sequences of the brand space (rows saved before the space existed have workspace_id null). */
export function scopedSequences(access: OutreachAccess) {
  return access.admin
    .from("outreach_sequences")
    .select("*")
    .eq("user_id", access.ownerId)
    .or(`workspace_id.eq.${access.spaceId},workspace_id.is.null`);
}

export async function loadOwnedSequence(access: OutreachAccess, id: string): Promise<Record<string, unknown> | null> {
  const { data } = await scopedSequences(access).eq("id", id).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

// ── Creator facts (stored data only) ──────────────────────────────────────────

function handleVariants(username: string): string[] {
  const base = username.replace(/^@+/, "").trim().toLowerCase();
  if (!base) return [];
  const bare = base.replace(/^(ig_|yt_)/, "");
  return Array.from(new Set([base, bare, `ig_${bare}`, `yt_${bare}`]));
}

function countryName(code: string | null | undefined, lang: string): string | null {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  try {
    return new Intl.DisplayNames([lang === "fr" ? "fr" : "en"], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

type IndexRow = {
  username: string;
  platform?: string | null;
  display_name?: string | null;
  followers?: number | null;
  avg_views?: number | null;
  engagement_rate?: number | null;
  primary_niche?: string | null;
  niches?: string[] | null;
  country_code?: string | null;
  language?: string | null;
  bio?: string | null;
  email?: string | null;
};

const INDEX_COLUMNS =
  "username, platform, display_name, followers, avg_views, engagement_rate, primary_niche, niches, country_code, language, bio, email";

export async function loadIndexRows(admin: SupabaseClient, usernames: string[]): Promise<IndexRow[]> {
  const keys = Array.from(new Set(usernames.flatMap(handleVariants)));
  if (!keys.length) return [];
  const out: IndexRow[] = [];
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await admin.from("creators_index").select(INDEX_COLUMNS).in("username", keys.slice(i, i + 200));
    if (error) {
      const fallback = await admin
        .from("creators_index")
        .select("username, platform, display_name, followers, engagement_rate, bio")
        .in("username", keys.slice(i, i + 200));
      out.push(...((fallback.data ?? []) as IndexRow[]));
    } else {
      out.push(...((data ?? []) as IndexRow[]));
    }
  }
  return out;
}

function pickIndexRow(rows: IndexRow[], username: string, platform: string): IndexRow | null {
  const variants = handleVariants(username);
  const candidates = rows.filter((r) => variants.includes(String(r.username).toLowerCase()));
  const p = platform.toLowerCase();
  return candidates.find((r) => String(r.platform ?? "").toLowerCase() === p) ?? candidates[0] ?? null;
}

export type SavedFallback = {
  display_name?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  primary_niche?: string | null;
  country_code?: string | null;
};

/** Facts for one creator from creators_index + their latest stored video caption. */
export async function loadCreatorFacts(
  admin: SupabaseClient,
  username: string,
  platform: string,
  lang: string,
  saved?: SavedFallback | null,
): Promise<CreatorFacts> {
  const rows = await loadIndexRows(admin, [username]);
  const row = pickIndexRow(rows, username, platform);
  let caption: string | null = null;
  if (row) {
    const { data } = await admin
      .from("creator_videos")
      .select("caption, posted_at")
      .eq("username", row.username)
      .not("caption", "is", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(1);
    caption = (data?.[0]?.caption as string | undefined)?.trim() || null;
  }
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
  return {
    username: (row?.username ?? username).replace(/^@+/, ""),
    platform: String(row?.platform ?? platform ?? "tiktok"),
    displayName: row?.display_name ?? saved?.display_name ?? null,
    niche: row?.primary_niche ?? row?.niches?.[0] ?? saved?.primary_niche ?? null,
    followers: num(row?.followers) ?? num(saved?.followers),
    avgViews: num(row?.avg_views),
    engagementRate: num(row?.engagement_rate) ?? num(saved?.engagement_rate),
    recentVideoCaption: caption,
    country: countryName(row?.country_code ?? saved?.country_code, lang),
    language: row?.language ?? null,
    bio: row?.bio ?? null,
  };
}

// ── Generation ─────────────────────────────────────────────────────────────────

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly code: "ai_not_configured" | "ai_refused" | "ai_bad_output" | "unsupported_numbers",
  ) {
    super(message);
  }
}

let anthropic: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new GenerationError("ANTHROPIC_API_KEY is not set", "ai_not_configured");
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

async function callJson(system: string, user: string, schema: Record<string, unknown>) {
  const response = await client().messages.create({
    model: SEQUENCE_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: { type: "json_schema", schema } },
  });
  if (response.stop_reason === "refusal") throw new GenerationError("The model declined this request", "ai_refused");
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = parseEmailJson(text);
  if (!parsed) throw new GenerationError("The model returned an unreadable answer", "ai_bad_output");
  return parsed;
}

export type GenerateInput = {
  facts: CreatorFacts;
  brandPitch: string;
  tone: SequenceTone;
  sequenceLang: SequenceLang;
  senderName?: string | null;
  stepIndex: number;
  /** Required for follow-ups (stepIndex > 0). */
  firstSubject?: string;
  firstBody?: string;
};

export type GeneratedEmail = {
  subject: string;
  body: string;
  languageCode: string;
  optOutLang: SequenceLang;
  usedFallback?: boolean;
};

/**
 * One personalised email. Any number the model writes that is not in the stored
 * facts or the brand's pitch triggers one rewrite; a second failure rejects the
 * first email (the brand sees why) and falls back to a number-free template for
 * follow-ups.
 */
export async function generateSequenceEmail(input: GenerateInput): Promise<GeneratedEmail> {
  const language = resolveEmailLanguage(input.facts.language, input.sequenceLang);
  const sources = numberSourcesFor(input.facts, input.brandPitch, language.code, [
    input.senderName ?? "",
    input.firstSubject ?? "",
    input.firstBody ?? "",
  ]);
  const name = (input.facts.displayName ?? "").split(/\s+/)[0] ?? "";

  if (input.stepIndex === 0) {
    const prompt = buildFirstEmailPrompt({
      facts: input.facts,
      brandPitch: input.brandPitch,
      tone: input.tone,
      languageName: language.name,
      senderName: input.senderName,
      lang: language.code,
    });
    let result = await callJson(prompt.system, prompt.user, FIRST_EMAIL_SCHEMA as unknown as Record<string, unknown>);
    let bad = findUnsupportedNumbers(`${result.subject ?? ""} ${result.body}`, sources);
    if (bad.length) {
      result = await callJson(
        prompt.system,
        `${prompt.user}\n\nYour previous draft used numbers that are not in the facts (${bad.join(", ")}). Rewrite it without them.`,
        FIRST_EMAIL_SCHEMA as unknown as Record<string, unknown>,
      );
      bad = findUnsupportedNumbers(`${result.subject ?? ""} ${result.body}`, sources);
      if (bad.length) throw new GenerationError(`Draft contained numbers not in the creator's data: ${bad.join(", ")}`, "unsupported_numbers");
    }
    if (!result.subject) throw new GenerationError("The model returned no subject", "ai_bad_output");
    return { subject: result.subject.replace(/[\r\n]+/g, " ").slice(0, 200), body: result.body, languageCode: language.code, optOutLang: language.optOutLang };
  }

  const fallback = (): GeneratedEmail => ({
    subject: input.firstSubject ?? "",
    body: fallbackFollowUp(input.stepIndex, language.code, name),
    languageCode: language.code,
    optOutLang: language.optOutLang,
    usedFallback: true,
  });
  try {
    const prompt = buildFollowUpPrompt({
      facts: input.facts,
      brandPitch: input.brandPitch,
      tone: input.tone,
      languageName: language.name,
      lang: language.code,
      firstSubject: input.firstSubject ?? "",
      firstBody: input.firstBody ?? "",
      followUpNumber: input.stepIndex,
    });
    const result = await callJson(prompt.system, prompt.user, FOLLOW_UP_SCHEMA as unknown as Record<string, unknown>);
    if (findUnsupportedNumbers(result.body, sources).length) return fallback();
    return { subject: input.firstSubject ?? "", body: result.body, languageCode: language.code, optOutLang: language.optOutLang };
  } catch (e) {
    if (e instanceof GenerationError && e.code === "ai_not_configured") throw e;
    return fallback();
  }
}

// ── Audience (saved creators and lists with an email) ─────────────────────────

export type AudienceCreator = {
  username: string;
  platform: string;
  name: string;
  email: string | null;
  saved?: SavedFallback;
};

type SavedRow = {
  creator_username: string;
  platform?: string | null;
  display_name?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  primary_niche?: string | null;
  country_code?: string | null;
  snapshot?: unknown;
};

const SAVED_COLUMNS = "creator_username, platform, display_name, followers, engagement_rate, primary_niche, country_code, snapshot";

function normHandle(h: string): string {
  return h.replace(/^@+/, "").trim().toLowerCase();
}

async function savedRows(admin: SupabaseClient, ownerId: string, spaceId: string): Promise<SavedRow[]> {
  let res = await admin.from("discovery_saved").select(SAVED_COLUMNS).eq("user_id", ownerId).eq("workspace_id", spaceId);
  if (res.error && isMissingWorkspaceIdError(res.error)) {
    res = await admin.from("discovery_saved").select(SAVED_COLUMNS).eq("user_id", ownerId);
  }
  return (res.data ?? []) as SavedRow[];
}

/** Every saved creator of the brand space, with the best email we hold for them. */
export async function savedAudience(admin: SupabaseClient, ownerId: string, spaceId: string): Promise<AudienceCreator[]> {
  const rows = await savedRows(admin, ownerId, spaceId);
  const linked = await fetchLinkedCreatorEmailsByHandle(admin, ownerId).catch(() => new Map<string, string>());
  const index = await loadIndexRows(admin, rows.map((r) => r.creator_username));
  return rows.map((r) => {
    const snap = r.snapshot && typeof r.snapshot === "object" ? (r.snapshot as Record<string, unknown>) : null;
    const handle = normHandle(r.creator_username);
    const idx = pickIndexRow(index, handle, String(r.platform ?? ""));
    const email = emailFromRow(snap) || linked.get(handle) || (idx?.email ?? "").trim() || "";
    return {
      username: handle,
      platform: String(r.platform ?? idx?.platform ?? "tiktok").toLowerCase(),
      name: String(r.display_name || idx?.display_name || handle),
      email: email && isValidEmailAddress(email) ? normalizeOutreachEmail(email) : null,
      saved: {
        display_name: r.display_name,
        followers: r.followers,
        engagement_rate: r.engagement_rate,
        primary_niche: r.primary_niche,
        country_code: r.country_code,
      },
    };
  });
}

export async function folderMembers(admin: SupabaseClient, ownerId: string, folderId: string): Promise<Set<string> | null> {
  const { data: folder } = await admin.from("discovery_folders").select("id").eq("id", folderId).eq("user_id", ownerId).maybeSingle();
  if (!folder) return null;
  const { data } = await admin.from("discovery_folder_items").select("creator_username").eq("folder_id", folderId);
  return new Set((data ?? []).map((r) => normHandle(String(r.creator_username))));
}

/** Emails that unsubscribed or bounced in any of this brand's sequences: never emailed again. */
export async function suppressedEmails(admin: SupabaseClient, ownerId: string): Promise<Set<string>> {
  const { data } = await admin
    .from("outreach_sequence_contacts")
    .select("creator_email, status, outreach_sequences!inner(user_id)")
    .eq("outreach_sequences.user_id", ownerId)
    .in("status", ["unsubscribed", "bounced"]);
  return new Set((data ?? []).map((r) => normalizeOutreachEmail(String(r.creator_email))));
}

// ── History mirror (so the existing Outreach history shows sequence emails) ──

export async function insertHistoryRow(
  admin: SupabaseClient,
  row: {
    user_id: string;
    workspace_id: string | null;
    creator_username: string;
    creator_display_name: string;
    message: string;
    follow_up_date: string | null;
  },
): Promise<string | null> {
  const base = {
    user_id: row.user_id,
    creator_username: row.creator_username,
    creator_display_name: row.creator_display_name,
    creator_avatar: "",
    platform: "Email",
    message: row.message,
    status: "sent",
    follow_up_date: row.follow_up_date,
    updated_at: new Date().toISOString(),
  };
  let res = await admin.from("outreach_history").insert({ ...base, workspace_id: row.workspace_id }).select("id").single();
  if (res.error) res = await admin.from("outreach_history").insert(base).select("id").single();
  return res.data?.id ? String(res.data.id) : null;
}
