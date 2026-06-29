import { Resend } from "resend";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  dedupeEmails,
  isValidEmailAddress,
  normalizeOutreachEmail,
  senderEmailDomain,
  splitBatchEmailRecipients,
} from "@/lib/outreach-email";

export const dynamic = "force-dynamic";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const MAX_RECIPIENTS = 50;
const MAX_BODY_LENGTH = 50_000;

function allowedDirectSendDomains(): string[] {
  return (process.env.OUTREACH_DIRECT_SEND_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function formatSenderAddress(displayName: string, email: string): string {
  const safeName = displayName.replace(/["<>]/g, "").trim() || email.split("@")[0];
  return `${safeName} <${email}>`;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!resend) {
    return NextResponse.json({ ok: false, error: "Email API not configured", fallback: "compose" }, { status: 503 });
  }

  let body: { fromEmail?: string; subject?: string; body?: string; recipients?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromEmail = normalizeOutreachEmail(String(body.fromEmail ?? ""));
  const subject = String(body.subject ?? "").trim();
  const textBody = String(body.body ?? "").trim();
  const recipients = dedupeEmails(Array.isArray(body.recipients) ? body.recipients.map(String) : []);

  if (!isValidEmailAddress(fromEmail)) {
    return NextResponse.json({ error: "Invalid sender email" }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (!textBody) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (textBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }
  if (recipients.length === 0) {
    return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_RECIPIENTS} recipients per batch` }, { status: 400 });
  }

  const allowedDomains = allowedDirectSendDomains();
  const fromDomain = senderEmailDomain(fromEmail);
  if (allowedDomains.length === 0 || !allowedDomains.includes(fromDomain)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Direct send is not enabled for this sender domain. Use your mail client instead.",
        fallback: "compose",
      },
      { status: 503 },
    );
  }

  const batch = splitBatchEmailRecipients(recipients);
  if (!batch) {
    return NextResponse.json({ error: "No valid recipients" }, { status: 400 });
  }

  let senderName = fromEmail.split("@")[0];
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: profile } = await admin
      .from("profiles")
      .select("business_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    senderName =
      profile?.business_name?.trim() ||
      profile?.full_name?.trim() ||
      senderName;
  }

  const htmlBody = textBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const { error } = await resend.emails.send({
    from: formatSenderAddress(senderName, fromEmail),
    replyTo: fromEmail,
    to: [batch.to],
    cc: batch.cc.length > 0 ? batch.cc : undefined,
    subject,
    text: textBody,
    html: `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.55; color: #1a1a1a;">${htmlBody}</div>`,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, fallback: "compose" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    mode: "api",
    sentFrom: fromEmail,
    recipientCount: batch.all.length,
  });
}
