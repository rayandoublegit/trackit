import { Resend } from "resend";
import { NextResponse } from "next/server";
import { isValidEmailAddress } from "@/lib/outreach-email";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export async function POST(request: Request) {
  if (!resend) return NextResponse.json({ ok: false });

  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  // Public route (called right after sign-up): only a real address, never raw HTML in the team email.
  if (!isValidEmailAddress(email)) return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });

  await resend.emails.send({
    from: "Trackit <onboarding@resend.dev>",
    replyTo: "rayan.vincentsully@gmail.com",
    to: "rayan.vincentsully@gmail.com",
    subject: `New Trackit signup: ${email}`,
    html: `<p>New signup on <strong>Trackit</strong> from <strong>${escapeHtml(email)}</strong></p>`,
  });

  return NextResponse.json({ ok: true });
}
