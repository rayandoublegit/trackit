// Automatic email campaigns (sequences) of the signed-in brand space.
// GET              list with per-status counts
// GET ?id=…        one sequence with its contacts
// POST             create a draft { name, mailboxId, brandPitch, tone, lang, steps, sendWindow }
// PATCH            { id, ...fields } edit (draft or paused), or { id, action: "launch" | "pause" | "resume" }
// DELETE ?id=…     delete the sequence (history rows stay)
import { NextResponse, type NextRequest } from "next/server";
import {
  nextWindowOpening,
  normalizeLang,
  normalizeSendWindow,
  normalizeSteps,
  normalizeTone,
  summarizeContacts,
} from "@/lib/outreach-sequences";
import {
  insertScoped,
  loadOwnedSequence,
  requireOutreachAccess,
  scopedSequences as scoped,
  type OutreachAccess,
} from "@/lib/outreach-sequences-server";

export const dynamic = "force-dynamic";

const CONTACT_COLUMNS =
  "id, creator_username, platform, creator_email, creator_name, step_index, next_send_at, status, thread_subject, last_error, sent_count, first_sent_at, last_sent_at, replied_at, personalization, created_at";

export async function GET(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const sequence = await loadOwnedSequence(access, id);
    if (!sequence) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const { data: contacts } = await access.admin
      .from("outreach_sequence_contacts")
      .select(CONTACT_COLUMNS)
      .eq("sequence_id", id)
      .order("created_at", { ascending: true })
      .limit(2000);
    const rows = (contacts ?? []).map((c) => {
      const p = (c.personalization ?? {}) as Record<string, unknown>;
      // Only the reviewed draft goes to the browser, not the full facts blob.
      return { ...c, personalization: undefined, draft: p.draft ?? null };
    });
    return NextResponse.json({ ok: true, sequence, contacts: rows, stats: summarizeContacts(rows) });
  }

  const { data, error } = await scoped(access).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const ids = (data ?? []).map((s) => s.id as string);
  const statsById = new Map<string, ReturnType<typeof summarizeContacts>>();
  if (ids.length) {
    const { data: contacts } = await access.admin
      .from("outreach_sequence_contacts")
      .select("sequence_id, status, sent_count")
      .in("sequence_id", ids)
      .limit(20000);
    const grouped = new Map<string, Array<{ status: string; sent_count: number }>>();
    for (const c of contacts ?? []) {
      const list = grouped.get(c.sequence_id as string) ?? [];
      list.push({ status: c.status as string, sent_count: Number(c.sent_count) || 0 });
      grouped.set(c.sequence_id as string, list);
    }
    for (const sid of ids) statsById.set(sid, summarizeContacts(grouped.get(sid) ?? []));
  }
  return NextResponse.json({
    ok: true,
    sequences: (data ?? []).map((s) => ({ ...s, stats: statsById.get(s.id as string) })),
  });
}

async function ownsMailbox(access: OutreachAccess, mailboxId: string): Promise<boolean> {
  const { data } = await access.admin
    .from("email_mailboxes")
    .select("id")
    .eq("id", mailboxId)
    .eq("user_id", access.ownerId)
    .maybeSingle();
  return Boolean(data);
}

function editableFields(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 120);
  if (body.brandPitch !== undefined) patch.brand_pitch = String(body.brandPitch).trim().slice(0, 3000);
  if (body.tone !== undefined) patch.tone = normalizeTone(body.tone);
  if (body.lang !== undefined) patch.lang = normalizeLang(body.lang);
  if (body.steps !== undefined) patch.steps = normalizeSteps(body.steps);
  if (body.sendWindow !== undefined) patch.send_window = normalizeSendWindow(body.sendWindow);
  return patch;
}

export async function POST(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const mailboxId = body.mailboxId ? String(body.mailboxId) : null;
  if (mailboxId && !(await ownsMailbox(access, mailboxId))) {
    return NextResponse.json({ ok: false, error: "mailbox_not_found" }, { status: 400 });
  }
  const fields = editableFields(body);
  const res = await insertScoped(access.admin, "outreach_sequences", {
    user_id: access.ownerId,
    workspace_id: access.spaceId,
    mailbox_id: mailboxId,
    status: "draft",
    name: (fields.name as string) || "Campaign",
    brand_pitch: (fields.brand_pitch as string) ?? "",
    tone: fields.tone ?? "friendly",
    lang: fields.lang ?? "en",
    steps: fields.steps ?? normalizeSteps([{ delay_days: 0 }, { delay_days: 3 }, { delay_days: 5 }]),
    send_window: fields.send_window ?? normalizeSendWindow(null),
  });
  if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sequence: res.data });
}

export async function PATCH(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const sequence = id ? await loadOwnedSequence(access, id) : null;
  if (!sequence) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const now = new Date();
  const action = body.action ? String(body.action) : null;
  const update = (patch: Record<string, unknown>) =>
    access.admin
      .from("outreach_sequences")
      .update({ ...patch, updated_at: now.toISOString() })
      .eq("id", id)
      .eq("user_id", access.ownerId)
      .select()
      .single();

  if (action === "pause") {
    if (sequence.status !== "active") return NextResponse.json({ ok: false, error: "not_active" }, { status: 409 });
    const res = await update({ status: "paused" });
    return NextResponse.json({ ok: !res.error, sequence: res.data, error: res.error?.message });
  }

  if (action === "launch" || action === "resume") {
    if (action === "launch" && sequence.status !== "draft") return NextResponse.json({ ok: false, error: "not_draft" }, { status: 409 });
    if (action === "resume" && sequence.status !== "paused") return NextResponse.json({ ok: false, error: "not_paused" }, { status: 409 });
    if (!String(sequence.brand_pitch ?? "").trim()) return NextResponse.json({ ok: false, error: "missing_pitch" }, { status: 400 });
    const mailboxId = sequence.mailbox_id ? String(sequence.mailbox_id) : "";
    const { data: mailbox } = mailboxId
      ? await access.admin.from("email_mailboxes").select("id, status").eq("id", mailboxId).eq("user_id", access.ownerId).maybeSingle()
      : { data: null };
    if (!mailbox) return NextResponse.json({ ok: false, error: "missing_mailbox" }, { status: 400 });
    if (mailbox.status !== "connected") return NextResponse.json({ ok: false, error: "mailbox_error" }, { status: 400 });

    const { count } = await access.admin
      .from("outreach_sequence_contacts")
      .select("id", { count: "exact", head: true })
      .eq("sequence_id", id)
      .in("status", ["pending", "sent"]);
    if (!count) return NextResponse.json({ ok: false, error: "no_contacts" }, { status: 400 });

    // Every contact still waiting for its first email becomes due when the window opens.
    const firstSlot = nextWindowOpening(now, normalizeSendWindow(sequence.send_window)).toISOString();
    await access.admin
      .from("outreach_sequence_contacts")
      .update({ next_send_at: firstSlot, updated_at: now.toISOString() })
      .eq("sequence_id", id)
      .eq("status", "pending")
      .is("next_send_at", null);

    const res = await update(action === "launch" ? { status: "active", launched_at: now.toISOString() } : { status: "active" });
    return NextResponse.json({ ok: !res.error, sequence: res.data, error: res.error?.message });
  }

  if (sequence.status === "active" || sequence.status === "done") {
    return NextResponse.json({ ok: false, error: "pause_first" }, { status: 409 });
  }
  const patch = editableFields(body);
  if (body.mailboxId !== undefined) {
    const mailboxId = body.mailboxId ? String(body.mailboxId) : null;
    if (mailboxId && !(await ownsMailbox(access, mailboxId))) {
      return NextResponse.json({ ok: false, error: "mailbox_not_found" }, { status: 400 });
    }
    patch.mailbox_id = mailboxId;
  }
  const res = await update(patch);
  if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 });
  // A changed pitch, tone or language invalidates the reviewed drafts.
  if (patch.brand_pitch !== undefined || patch.tone !== undefined || patch.lang !== undefined) {
    const { data: contacts } = await access.admin
      .from("outreach_sequence_contacts")
      .select("id, personalization")
      .eq("sequence_id", id)
      .eq("status", "pending");
    for (const c of contacts ?? []) {
      const p = { ...((c.personalization ?? {}) as Record<string, unknown>) };
      if (!p.draft) continue;
      delete p.draft;
      await access.admin.from("outreach_sequence_contacts").update({ personalization: p }).eq("id", c.id);
    }
  }
  return NextResponse.json({ ok: true, sequence: res.data });
}

export async function DELETE(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const sequence = id ? await loadOwnedSequence(access, id) : null;
  if (!sequence) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { error } = await access.admin.from("outreach_sequences").delete().eq("id", id).eq("user_id", access.ownerId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
