// Creators inside a sequence.
// GET ?audience=1                      saved creators and lists, and how many have an email
// GET ?sequenceId=…                    the sequence's contacts
// POST { sequenceId, source: "saved" | "folder" | "creators", folderId?, creators?: [{ username, platform?, email?, name? }] }
// DELETE ?sequenceId=…&contactId=…     remove a contact that has not been emailed yet
import { NextResponse, type NextRequest } from "next/server";
import { isValidEmailAddress, normalizeOutreachEmail } from "@/lib/outreach-email";
import { nextWindowOpening, normalizeSendWindow } from "@/lib/outreach-sequences";
import {
  folderMembers,
  loadOwnedSequence,
  requireOutreachAccess,
  savedAudience,
  suppressedEmails,
  type AudienceCreator,
} from "@/lib/outreach-sequences-server";

export const dynamic = "force-dynamic";

const MAX_CONTACTS_PER_SEQUENCE = 2000;

export async function GET(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const params = request.nextUrl.searchParams;

  if (params.get("audience")) {
    const saved = await savedAudience(access.admin, access.ownerId, access.spaceId);
    const { data: folders } = await access.admin
      .from("discovery_folders")
      .select("id, name")
      .eq("user_id", access.ownerId)
      .order("position", { ascending: true });
    const emailByHandle = new Map(saved.map((c) => [c.username, Boolean(c.email)]));
    const folderStats = await Promise.all(
      (folders ?? []).map(async (f) => {
        const members = (await folderMembers(access.admin, access.ownerId, String(f.id))) ?? new Set<string>();
        let withEmail = 0;
        for (const h of members) if (emailByHandle.get(h)) withEmail += 1;
        return { id: f.id, name: f.name, total: members.size, withEmail };
      }),
    );
    return NextResponse.json({
      ok: true,
      saved: { total: saved.length, withEmail: saved.filter((c) => c.email).length },
      folders: folderStats,
      creators: saved.map((c) => ({ username: c.username, platform: c.platform, name: c.name, hasEmail: Boolean(c.email) })),
    });
  }

  const sequenceId = params.get("sequenceId") ?? "";
  if (!sequenceId || !(await loadOwnedSequence(access, sequenceId))) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const { data } = await access.admin
    .from("outreach_sequence_contacts")
    .select("id, creator_username, platform, creator_email, creator_name, status, step_index, next_send_at, sent_count, last_error")
    .eq("sequence_id", sequenceId)
    .order("created_at", { ascending: true });
  return NextResponse.json({ ok: true, contacts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sequenceId = String(body.sequenceId ?? "");
  const sequence = sequenceId ? await loadOwnedSequence(access, sequenceId) : null;
  if (!sequence) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (sequence.status === "done") return NextResponse.json({ ok: false, error: "sequence_done" }, { status: 409 });

  const source = String(body.source ?? "creators");
  const saved = await savedAudience(access.admin, access.ownerId, access.spaceId);
  let pool: AudienceCreator[] = [];

  if (source === "saved") {
    pool = saved;
  } else if (source === "folder") {
    const members = await folderMembers(access.admin, access.ownerId, String(body.folderId ?? ""));
    if (!members) return NextResponse.json({ ok: false, error: "folder_not_found" }, { status: 404 });
    pool = saved.filter((c) => members.has(c.username));
  } else {
    const list = Array.isArray(body.creators) ? body.creators.slice(0, 500) : [];
    const savedByHandle = new Map(saved.map((c) => [c.username, c]));
    pool = list.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const username = String(r.username ?? "").replace(/^@+/, "").trim().toLowerCase();
      const known = savedByHandle.get(username);
      const typed = normalizeOutreachEmail(String(r.email ?? ""));
      return {
        username,
        platform: String(r.platform ?? known?.platform ?? "tiktok").toLowerCase(),
        name: String(r.name ?? known?.name ?? username),
        email: typed && isValidEmailAddress(typed) ? typed : (known?.email ?? null),
        saved: known?.saved,
      };
    }).filter((c) => c.username);
  }

  const suppressed = await suppressedEmails(access.admin, access.ownerId);
  const { data: existing } = await access.admin
    .from("outreach_sequence_contacts")
    .select("creator_email")
    .eq("sequence_id", sequenceId);
  const already = new Set((existing ?? []).map((r) => normalizeOutreachEmail(String(r.creator_email))));

  const now = new Date();
  const dueAt =
    sequence.status === "active" ? nextWindowOpening(now, normalizeSendWindow(sequence.send_window)).toISOString() : null;
  let skippedNoEmail = 0;
  let skippedSuppressed = 0;
  let skippedDuplicate = 0;
  const rows: Record<string, unknown>[] = [];
  for (const c of pool) {
    if (!c.email) {
      skippedNoEmail += 1;
      continue;
    }
    if (suppressed.has(c.email)) {
      skippedSuppressed += 1;
      continue;
    }
    if (already.has(c.email)) {
      skippedDuplicate += 1;
      continue;
    }
    already.add(c.email);
    rows.push({
      sequence_id: sequenceId,
      creator_username: c.username,
      platform: c.platform,
      creator_email: c.email,
      creator_name: c.name,
      personalization: { saved: c.saved ?? null },
      status: "pending",
      step_index: 0,
      next_send_at: dueAt,
    });
  }
  const room = Math.max(0, MAX_CONTACTS_PER_SEQUENCE - (existing?.length ?? 0));
  const toInsert = rows.slice(0, room);
  if (toInsert.length) {
    const { error } = await access.admin.from("outreach_sequence_contacts").insert(toInsert);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    added: toInsert.length,
    skippedNoEmail,
    skippedSuppressed,
    skippedDuplicate,
    skippedOverLimit: rows.length - toInsert.length,
  });
}

export async function DELETE(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const params = request.nextUrl.searchParams;
  const sequenceId = params.get("sequenceId") ?? "";
  const contactId = params.get("contactId") ?? "";
  if (!sequenceId || !contactId || !(await loadOwnedSequence(access, sequenceId))) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const { error } = await access.admin
    .from("outreach_sequence_contacts")
    .delete()
    .eq("id", contactId)
    .eq("sequence_id", sequenceId)
    .eq("status", "pending")
    .eq("sent_count", 0);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
