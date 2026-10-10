// Connected mailboxes of the signed-in brand (SMTP + IMAP).
// GET    list (never the password)
// POST   connect: verifies the SMTP login and the IMAP login, then saves (encrypted)
// PATCH  { id, fromName?, dailyLimit?, signature? }
// DELETE ?id=…  (active sequences using it are paused)
import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret, isMailboxEncryptionConfigured } from "@/lib/mailbox-crypto";
import { getMailboxDriver, type MailboxCredentials } from "@/lib/mailbox-driver";
import {
  clampDailyLimit,
  friendlyMailboxError,
  MAILBOX_PUBLIC_COLUMNS,
  normalizeMailboxConnectInput,
} from "@/lib/mailbox-providers";
import { insertScoped, requireOutreachAccess } from "@/lib/outreach-sequences-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function langOf(request: NextRequest, body?: Record<string, unknown>): "en" | "fr" {
  const raw = String(body?.lang ?? request.nextUrl.searchParams.get("lang") ?? "");
  return raw === "fr" ? "fr" : "en";
}

export async function GET(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const { admin, ownerId } = access;

  const { data, error } = await admin
    .from("email_mailboxes")
    .select(MAILBOX_PUBLIC_COLUMNS)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await Promise.all(
    (data ?? []).map(async (m) => {
      const { count } = await admin
        .from("outreach_messages")
        .select("id", { count: "exact", head: true })
        .eq("mailbox_id", m.id)
        .not("sent_at", "is", null)
        .gte("sent_at", since);
      return { ...m, sent_last_24h: count ?? 0 };
    }),
  );
  return NextResponse.json({ ok: true, mailboxes: rows, encryptionReady: isMailboxEncryptionConfigured() });
}

export async function POST(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const { admin, ownerId, spaceId } = access;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const lang = langOf(request, body);
  if (!isMailboxEncryptionConfigured()) {
    return NextResponse.json({ ok: false, error: "encryption_not_configured" }, { status: 503 });
  }
  const parsed = normalizeMailboxConnectInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const input = parsed.value;

  const creds: MailboxCredentials = {
    provider: input.provider,
    authType: "password",
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    username: input.username,
    password: input.password,
  };
  const driver = getMailboxDriver("password");

  try {
    await driver.verifySmtp(creds);
  } catch (e) {
    const raw = (e as Error).message || "SMTP error";
    return NextResponse.json({ ok: false, step: "smtp", error: friendlyMailboxError(raw, lang), detail: raw.slice(0, 300) }, { status: 422 });
  }
  try {
    await driver.verifyImap(creds);
  } catch (e) {
    const raw = (e as Error).message || "IMAP error";
    return NextResponse.json({ ok: false, step: "imap", error: friendlyMailboxError(raw, lang), detail: raw.slice(0, 300) }, { status: 422 });
  }

  const row = {
    user_id: ownerId,
    workspace_id: spaceId,
    provider: input.provider,
    auth_type: "password",
    from_name: input.fromName,
    from_email: input.fromEmail,
    smtp_host: input.smtpHost,
    smtp_port: input.smtpPort,
    smtp_secure: input.smtpSecure,
    imap_host: input.imapHost,
    imap_port: input.imapPort,
    username: input.username,
    secret_encrypted: encryptSecret(input.password),
    daily_limit: input.dailyLimit,
    signature: input.signature,
    status: "connected",
    last_error: null,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Reconnecting the same address updates it in place (new password, settings).
  const { data: existing } = await admin
    .from("email_mailboxes")
    .select("id")
    .eq("user_id", ownerId)
    .eq("from_email", input.fromEmail)
    .maybeSingle();

  const res = existing?.id
    ? await admin.from("email_mailboxes").update(row).eq("id", existing.id).eq("user_id", ownerId).select(MAILBOX_PUBLIC_COLUMNS).single()
    : await insertScoped(admin, "email_mailboxes", row);
  if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 });

  const saved = res.data as Record<string, unknown>;
  delete saved.secret_encrypted;
  return NextResponse.json({ ok: true, mailbox: { ...saved, sent_last_24h: 0 } });
}

export async function PATCH(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const { admin, ownerId } = access;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.fromName !== undefined) patch.from_name = String(body.fromName).replace(/["<>\r\n]/g, "").trim().slice(0, 120);
  if (body.dailyLimit !== undefined) patch.daily_limit = clampDailyLimit(body.dailyLimit);
  if (body.signature !== undefined) patch.signature = String(body.signature).slice(0, 2000);

  const { data, error } = await admin
    .from("email_mailboxes")
    .update(patch)
    .eq("id", id)
    .eq("user_id", ownerId)
    .select(MAILBOX_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, mailbox: data });
}

export async function DELETE(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const { admin, ownerId } = access;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  await admin
    .from("outreach_sequences")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("user_id", ownerId)
    .eq("mailbox_id", id)
    .eq("status", "active");
  const { error } = await admin.from("email_mailboxes").delete().eq("id", id).eq("user_id", ownerId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
