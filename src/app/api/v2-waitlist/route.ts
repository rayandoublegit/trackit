import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    firstName?: string;
    email?: string;
    note?: string;
  };

  const firstName = String(body.firstName || "").trim();
  const email = String(body.email || "").trim();
  const note = String(body.note || "").trim();

  if (!firstName || !email) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  if (resend) {
    await resend.emails.send({
      from: "Trackit <onboarding@resend.dev>",
      replyTo: email,
      to: "rayan.vincentsully@gmail.com",
      subject: `🚀 Trackit v2 waitlist: ${email}`,
      html: `<p><strong>${firstName}</strong> (${email}) joined the Trackit v2 waitlist.</p>${note ? `<p>${note}</p>` : ""}`,
    });
  }

  return NextResponse.json({ ok: true });
}
