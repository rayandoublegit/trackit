import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function POST(request: Request) {
  if (!resend) return NextResponse.json({ ok: false });

  const { email } = await request.json();

  await resend.emails.send({
    from: "Klayan <notifications@klayan.app>",
    replyTo: "klayan.app@gmail.com",
    to: "klayan.app@gmail.com",
    subject: `🔥 New signup: ${email}`,
    html: `<p>New signup from <strong>${email}</strong> — let's go brother 🔥</p>`,
  });

  return NextResponse.json({ ok: true });
}
