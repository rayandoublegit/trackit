import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function POST(request: Request) {
  if (!resend) return NextResponse.json({ ok: false });

  const { email } = await request.json();

  await resend.emails.send({
    from: "Trackit <onboarding@resend.dev>",
    replyTo: "rayan.vincentsully@gmail.com",
    to: "rayan.vincentsully@gmail.com",
    subject: `🔥 New Trackit signup: ${email}`,
    html: `<p>New signup on <strong>Trackit</strong> from <strong>${email}</strong> 🔥</p>`,
  });

  return NextResponse.json({ ok: true });
}
