// POST { id, lang? } — sends a short test email from the mailbox to itself, so the
// brand sees a real message arrive in their own inbox.
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { credentialsFromRow, getMailboxDriver } from "@/lib/mailbox-driver";
import { friendlyMailboxError } from "@/lib/mailbox-providers";
import { composeHtml, composePlainText, makeMessageId } from "@/lib/outreach-sequences";
import { requireOutreachAccess } from "@/lib/outreach-sequences-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const { admin, ownerId } = access;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const lang = body.lang === "fr" ? "fr" : "en";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: mailbox } = await admin.from("email_mailboxes").select("*").eq("id", id).eq("user_id", ownerId).maybeSingle();
  if (!mailbox) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const text =
    lang === "fr"
      ? "Ceci est un e-mail de test envoyé par Trackit depuis votre boîte. Si vous le lisez, l'envoi automatique fonctionne."
      : "This is a test email sent by Trackit from your mailbox. If you can read it, automatic sending works.";
  try {
    const creds = credentialsFromRow(mailbox);
    const { messageId } = await getMailboxDriver(mailbox.auth_type).send(creds, {
      to: creds.fromEmail,
      subject: lang === "fr" ? "Test Trackit : votre boîte est connectée" : "Trackit test: your mailbox is connected",
      text: composePlainText(text, String(mailbox.signature ?? ""), lang),
      html: composeHtml(text, String(mailbox.signature ?? ""), lang),
      messageId: makeMessageId(creds.fromEmail, randomUUID()),
    });
    await admin
      .from("email_mailboxes")
      .update({ status: "connected", last_error: null, last_checked_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true, sentTo: creds.fromEmail, messageId });
  } catch (e) {
    const raw = (e as Error).message || "Send failed";
    await admin
      .from("email_mailboxes")
      .update({ status: "error", last_error: raw.slice(0, 500), last_checked_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: false, error: friendlyMailboxError(raw, lang) }, { status: 422 });
  }
}
